#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MPU6050.h>
#include "MAX30105.h" 
#include "heartRate.h"
#include "soc/rtc_cntl_reg.h"
#include <WiFi.h>
#include <ArduinoOTA.h>
#include "secrets.h"

// --- OTA Globals ---
const char* ssid = SECRET_SSID;
const char* password = SECRET_PASSWORD;
bool otaModeActive = false;

// --- BLE Globals ---
BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic;
bool deviceConnected = false;

#define SERVICE_UUID           "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_RX "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
#define CHARACTERISTIC_UUID_TX "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"

// --- Sensor Objects ---
Adafruit_BME680 bme;
Adafruit_MPU6050 mpu;
MAX30105 particleSensor;

float mountAngle = 40.0; 


// I2C Pin Definition for ESP32-S3
#define I2C_SDA 8 
#define I2C_SCL 9

SemaphoreHandle_t i2cMutex;

// --- Biometric Logic ---
const byte RATE_SIZE = 4; 
byte rates[RATE_SIZE]; 
byte rateSpot = 0;
long lastBeat = 0; 
float beatsPerMinute;
int beatAvg;

TaskHandle_t BioTaskHandle;
TaskHandle_t EnvTaskHandle;

// --- BLE Event Handlers ---
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("Phone Connected!");
    };
    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("Phone Disconnected. Re-advertising...");
      delay(500);
      pServer->startAdvertising();
    }
};

class MyCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue().c_str();
      if (rxValue.length() > 0) {
        Serial.print("Phone says: ");
        Serial.println(rxValue);
        Serial1.print(rxValue); 
      }
    }
};

// --- Tap Detection Globals ---
float lastMag = 9.8; // Baseline Earth Gravity
unsigned long lastTapTime = 0;
const float tapThreshold = 10.0; // Lowered slightly since we are reading total magnitude
const int tapDebounce = 300;     // Ms between allowed taps

void detectTap(sensors_event_t a) {
  // 1. Calculate the total force vector across all 3 axes
  float currentMag = sqrt(pow(a.acceleration.x, 2) + 
                          pow(a.acceleration.y, 2) + 
                          pow(a.acceleration.z, 2));

  // 2. Look for a sudden, sharp spike in overall force
  float delta = abs(currentMag - lastMag);

  if (delta > tapThreshold && (millis() - lastTapTime > tapDebounce)) {
    lastTapTime = millis();
    
    Serial1.print("ACT|TAP\n"); 
    Serial.println("Gesture: Tap Detected!");
  }
  
  lastMag = currentMag;
}

// --- Wake Detection Globals ---
bool isAwake = true;
unsigned long lastMoveTime = 0;

void detectLiftToWake(sensors_event_t a, sensors_event_t g) {
  // 1. Define your physical mounting angle
  // (Change to -40.0 if the sensor is tilted in the opposite direction)
  float rad = mountAngle * (PI / 180.0);

  // 2. The Virtual Rotation Matrix
  // This mathematically flattens the Y and Z axes to match the screen
  float flatY = (a.acceleration.y * cos(rad)) - (a.acceleration.z * sin(rad));
  float flatZ = (a.acceleration.y * sin(rad)) + (a.acceleration.z * cos(rad));

  // 3. Evaluate the corrected "flat" vectors
  bool verticalTilt = flatY > 6.0; // Arm tilted up
  bool faceUp = flatZ > 5.0;       // Screen facing up

  if (verticalTilt && faceUp) {
    if (!isAwake) {
      isAwake = true;
      Serial1.print("ACT|LIFTED\n"); 
      Serial.println("Gesture: Wake Triggered");
    }
    lastMoveTime = millis();
  } else {
    // Auto-sleep logic: 10 seconds of no viewing angle
    if (isAwake && (millis() - lastMoveTime > 10000)) {
      isAwake = false;
      Serial1.print("ACT|DOWN\n");
      Serial.println("Gesture: Sleep Triggered");
    }
  }
}

// --- Sensor Task: Biometrics (High Priority) ---
void BioTask(void * parameter) {
  for(;;) {
    long irValue = 0;
    
    // Ask the traffic cop for permission to use the I2C wire
    if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
      irValue = particleSensor.getIR();
      xSemaphoreGive(i2cMutex); // Release the wire!
    }

    if (irValue > 50000) { 
      if (checkForBeat(irValue) == true) {
        long delta = millis() - lastBeat;
        lastBeat = millis();
        beatsPerMinute = 60 / (delta / 1000.0);
        if (beatsPerMinute < 255 && beatsPerMinute > 20) {
          rates[rateSpot++] = (byte)beatsPerMinute;
          rateSpot %= RATE_SIZE;
          beatAvg = 0;
          for (byte x = 0 ; x < RATE_SIZE ; x++) beatAvg += rates[x];
          beatAvg /= RATE_SIZE;

          Serial1.print("DASH|BIO:BPM:" + String(beatAvg) + "\n");
        }
      }
    }
    vTaskDelay(10 / portTICK_PERIOD_MS);
  }
}

// --- Sensor Task: Environment/Hazmat (Low Priority) ---
void EnvTask(void * parameter) {
  unsigned long lastBmeRead = 0;
  
  for(;;) {
    sensors_event_t a, g, temp;
    
    // 1. FAST READ: Get Gyroscope data safely
    if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
      mpu.getEvent(&a, &g, &temp);
      xSemaphoreGive(i2cMutex); 
    }
    
    detectLiftToWake(a, g); 
    detectTap(a);

    // 2. SLOW READ: Only poll the weather sensor every 2000ms
    if (millis() - lastBmeRead > 2000) {
      lastBmeRead = millis();
      bool bmeSuccess = false;
      
      if (xSemaphoreTake(i2cMutex, portMAX_DELAY)) {
        bmeSuccess = bme.performReading();
        xSemaphoreGive(i2cMutex);
      }

      if (bmeSuccess) {
        // Example: The combined heat of the VOC plate, ESP32 wires, and your wrist = 12.5F
        float rawTempF = (bme.temperature * 1.8) + 32.0;
        float calibratedTempF = rawTempF - 10.5; 
        
        String envData = "DASH|WEAT:" + String(calibratedTempF, 1) + "F " + 
                         String(bme.humidity, 0) + "% " + 
                         String(bme.gas_resistance / 1000.0, 1) + "kOhm\n";
        Serial1.print(envData);
      }
    }
    
    // Loop incredibly fast (20ms / 50Hz) so we never miss a quick tap!
    vTaskDelay(20 / portTICK_PERIOD_MS); 
  }
}

void setup() {
  Serial.begin(115200);
  Serial1.begin(115200, SERIAL_8N1, 4, 5); // TX=5, RX=4 
  
  Wire.begin(I2C_SDA, I2C_SCL);
  
  // Init Hardware
  if (!bme.begin()) Serial.println("BME680 Fail");
  if (!mpu.begin()) Serial.println("MPU6050 Fail");
  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) Serial.println("MAX30102 Fail");

  bme.setGasHeater(350, 150);
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);

  i2cMutex = xSemaphoreCreateMutex();

  // Init BLE [cite: 8, 9, 10, 11]
  BLEDevice::init("Pip-Watch");
  BLEDevice::setMTU(512);
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());
  BLEService *pService = pServer->createService(SERVICE_UUID);
  pTxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_TX, BLECharacteristic::PROPERTY_NOTIFY);
  pTxCharacteristic->addDescriptor(new BLE2902());
  BLECharacteristic *pRxCharacteristic = pService->createCharacteristic(CHARACTERISTIC_UUID_RX, BLECharacteristic::PROPERTY_WRITE);
  pRxCharacteristic->setCallbacks(new MyCallbacks());
  pService->start();
  pServer->getAdvertising()->start();

  // Pin edge-computing tasks to Core 0 to leave BLE handling on Core 1
  xTaskCreatePinnedToCore(BioTask, "BioTask", 4000, NULL, 2, &BioTaskHandle, 0);
  xTaskCreatePinnedToCore(EnvTask, "EnvTask", 4000, NULL, 1, &EnvTaskHandle, 0);
}

void loop() {
  if (Serial1.available()) {
    String fromPipBoy = Serial1.readStringUntil('\n');

    String commandCheck = fromPipBoy;
    commandCheck.trim(); 

    if (commandCheck == "SYS|REBOOT") {                                                                                                                                                                                                                                                                                                                                                                         
      Serial.println("Reboot command received from Pip-Boy! Restarting ESP32...");
      delay(500); // Brief pause to ensure the serial monitor prints the message
      ESP.restart();  // This triggers a hard reset of the ESP32
    }
    else if (commandCheck == "SYS|CALIB") {
      Serial.println("Calculating new Gyroscope baseline...");
      
      float sumY = 0;
      float sumZ = 0;
      
      // Take 20 rapid readings of the gravity vectors
      for(int i = 0; i < 20; i++) {
        sensors_event_t a, g, temp;
        mpu.getEvent(&a, &g, &temp);
        sumY += a.acceleration.y;
        sumZ += a.acceleration.z;
        delay(50); 
      }
      
      // Average the readings to filter out any micro-vibrations from the table
      float avgY = sumY / 20.0;
      float avgZ = sumZ / 20.0;
      
      // Calculate the exact mounting angle in degrees
      mountAngle = atan2(avgY, avgZ) * (180.0 / PI);
      
      Serial.print("New Mount Angle applied: ");
      Serial.println(mountAngle);
      
      // Ping the Pip-Boy with a confirmation notification
      Serial1.print("NOTIF|                SYS:GYRO MATRICES SYNCED\n");
    }
    // Hands-free Bootloader Jump
    else if (commandCheck == "SYS|UPLOAD") {
      Serial.println("Activating Wireless OTA Bootloader...");
      Serial1.print("NOTIF|SYS:WIFI UPLINK ACTIVE\n");
      
      // Turn off Bluetooth to free up the radio
      BLEDevice::deinit(true); 
      
      // Connect to Home WiFi
      WiFi.mode(WIFI_STA);
      WiFi.begin(ssid, password);
      
      int attempts = 0;
      while (WiFi.status() != WL_CONNECTED && attempts < 10) {
        delay(500);
        Serial.print(".");
        attempts++;
      }
      
      if (WiFi.status() == WL_CONNECTED) {
        Serial.println("\nWiFi Connected! IP: " + WiFi.localIP().toString());
        
        // Start the OTA Listener
        ArduinoOTA.setHostname("RobCo-Uplink-S3");
        ArduinoOTA.begin();
        otaModeActive = true; 
        
        Serial1.print("NOTIF|SYS:READY FOR FLASH\n");
      } else {
        Serial1.print("NOTIF|SYS:WIFI FAILED\n");
      }
    }
    fromPipBoy += "\n";
    if (deviceConnected) {
      pTxCharacteristic->setValue(fromPipBoy.c_str());
      pTxCharacteristic->notify();
    }
  }
  if (otaModeActive) {
    ArduinoOTA.handle();
  }
  delay(10);
}