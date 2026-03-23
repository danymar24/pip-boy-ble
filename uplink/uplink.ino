#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include <Wire.h>
#include <Adafruit_BME680.h>
#include <Adafruit_MPU6050.h>
#include "MAX30105.h" 
#include "heartRate.h"

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

// I2C Pin Definition for ESP32-S3
#define I2C_SDA 8 
#define I2C_SCL 9

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

// Add these variables to your globals
float lastAy = 0;
bool isAwake = true;
unsigned long lastMoveTime = 0;

void detectLiftToWake(sensors_event_t a, sensors_event_t g) {
  // A 'Viewing' position typically means:
  // 1. The Y-axis (along your arm) is tilted up.
  // 2. The Z-axis (out of screen) is facing up towards you.
  
  // Normalized gravity detection (Assuming MPU6050 is flat behind the screen)
  // Values are in m/s^2. 9.8 = 1G.
  bool verticalTilt = a.acceleration.y > 6.0; // Arm tilted up
  bool faceUp = a.acceleration.z > 5.0;     // Screen facing up

  if (verticalTilt && faceUp) {
    if (!isAwake) {
      isAwake = true;
      Serial1.print("PWR|WAKE\n"); // Send custom power command to JS
      Serial.println("Gesture: Wake Triggered");
    }
    lastMoveTime = millis();
  } else {
    // Auto-sleep logic: If no 'viewing' orientation for 10 seconds
    if (isAwake && (millis() - lastMoveTime > 10000)) {
      isAwake = false;
      Serial1.print("PWR|SLEEP\n");
      Serial.println("Gesture: Sleep Triggered");
    }
  }
}

// --- Sensor Task: Biometrics (High Priority) ---
void BioTask(void * parameter) {
  for(;;) {
    long irValue = particleSensor.getIR();
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

          // Aligning with RobCo OS DASH protocol
          Serial1.print("DASH|BIO:BPM:" + String(beatAvg) + "\n");
        }
      }
    }
    vTaskDelay(10 / portTICK_PERIOD_MS); 
  }
}

// --- Sensor Task: Environment/Hazmat (Low Priority) ---
void EnvTask(void * parameter) {
  for(;;) {
    sensors_event_t a, g, temp;
    mpu.getEvent(&a, &g, &temp);
    
    detectLiftToWake(a, g); // Check for gesture every 500ms
    
    if (bme.performReading()) {
      float tempF = (bme.temperature * 1.8) + 32.0;
      // Formatting for the Pip-Boy's INV tab hijack
      String envData = "DASH|WEAT:" + String(tempF, 1) + "F " + 
                       String(bme.humidity, 0) + "% " + 
                       String(bme.gas_resistance / 1000.0, 1) + "kOhm\n";
      Serial1.print(envData);
    }
    vTaskDelay(2000 / portTICK_PERIOD_MS); 
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

  bme.setGasHeater(320, 150);
  particleSensor.setup();
  particleSensor.setPulseAmplitudeRed(0x0A);

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
    fromPipBoy += "\n";
    if (deviceConnected) {
      pTxCharacteristic->setValue(fromPipBoy.c_str());
      pTxCharacteristic->notify();
    }
  }
  delay(10);
}