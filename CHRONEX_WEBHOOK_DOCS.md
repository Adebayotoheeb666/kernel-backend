# Chronex → Kernel Webhook Integration Guide

This document provides instructions for the Chronex team on how to notify the Kernel backend when a payment is overdue, in order to trigger automatic device locking.

## 1. Webhook Endpoint
The backend exposes a secure POST endpoint for receiving payment-due notifications.

- **URL**: `https://kernel-backend-nzrp.onrender.com/webhooks/payment-due/receive`
- **Method**: `POST`
- **Content-Type**: `application/json`

## 2. Authentication
All webhook requests must include a secret token in the request headers to be processed.

- **Header Key**: `X-Webhook-Token`
- **Header Value**: `81376709915ea54903ef19c298ad5a361223112322a59b688d232a84711dea6b`

## 3. Payload Format
The body of the message must be a JSON object containing the device's unique identifier (`device_id`).

```json
{
  "device_id": "356938035643809"
}
```

*Note: The `device_id` should correspond to the IMEI or the identifier used during device registration.*

## 4. Expected Responses
- **200 OK**: The notification was received and processed successfully.
- **401 Unauthorized**: The `X-Webhook-Token` was missing or incorrect.
- **400 Bad Request**: The `device_id` was missing from the request body.
- **500 Internal Server Error**: A server-side error occurred. The request should be retried.

## 5. Testing with Curl
You can verify the integration from your environment using the following command:

```bash
curl -X POST https://kernel-backend-nzrp.onrender.com/webhooks/payment-due/receive \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Token: 81376709915ea54903ef19c298ad5a361223112322a59b688d232a84711dea6b" \
  -d '{"device_id":"REPLACE_WITH_ACTUAL_DEVICE_ID"}'
```
