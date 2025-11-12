# GoldQuest Global – Client Portal API Documentation

**Version:** 1.0
**Base URL:** `http://api.goldquestglobal.in/branch/api`
**Authentication:** Access Token (generated from Client Portal → Integration Tab)

---

## Table of Contents

1. [Authentication](#authentication)
2. [Get Services Granted to Client](#get-services-granted-to-client)
3. [Create Candidate Application](#create-candidate-application)
4. [Request & Response Examples](#request--response-examples)
5. [Data Field Descriptions](#data-field-descriptions)

---

## Authentication

All API requests require an **Access Token** generated from the **Client Portal → Integration Tab**.

* **Type:** Query parameter for GET requests, part of JSON body for POST requests
* **Example:**

```text
access_token=2716fc00ba3179fc4f592d84c0b7f1bd.dc9ddff93c8084eb30f4b50c73293b13
```

> Keep your access token secure. Do not expose it publicly.

---

## Get Services Granted to Client

**Endpoint:** `/services`
**Method:** `GET`
**Description:** Retrieves all services allocated to the client.

### Request

```javascript
const requestOptions = {
  method: "GET",
  redirect: "follow"
};

fetch("http://api.goldquestglobal.in/branch/api/services?access_token=<ACCESS_TOKEN>", requestOptions)
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### Response

```json
{
  "status": false,
  "result": {
    "status": true,
    "message": "Customer and allocated services fetched successfully.",
    "data": {
      "services": [
        {
          "id": 1,
          "title": "LATEST EMPLOYMENT-1",
          "group": "Employment"
        },
        {
          "id": 7,
          "title": "PERMANENT ADDRESS",
          "group": "Address"
        },
        {
          "id": 9,
          "title": "POST GRADUATION",
          "group": "Education"
        }
        // ... more services
      ]
    }
  }
}
```

**Notes:**

* `id` → Unique service identifier
* `title` → Service name
* `group` → Category of the service (e.g., Employment, Education, Address)

---

## Create Candidate Application

**Endpoint:** `/candidate-application/create`
**Method:** `POST`
**Description:** Submits a new candidate application which triggers the BGV (Background Verification) form.

### Request Headers

```http
Content-Type: application/json
```

### Request Body

```json
{
  "access_token": "<ACCESS_TOKEN>",
  "name": "John Doe",
  "employee_id": "EMP12345",
  "mobile_number": "8888888888",
  "email": "johndoe@example.com",
  "services": "1,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,35,37,65,66,67,68,69,74,75,76,77,78,79",
  "candidate_application_id": "",
  "nationality": "Indian",
  "purpose_of_application": "NORMAL BGV(EMPLOYMENT)",
  "attach_documents": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUh",
    "data:image/png;base64,iVBORw0KGgoAAAANSUh"
  ],
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUh"
}
```

### JavaScript Example

```javascript
const myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

const raw = JSON.stringify({
  "access_token": "<ACCESS_TOKEN>",
  "name": "John Doe",
  "employee_id": "EMP12345",
  "mobile_number": "8888888888",
  "email": "johndoe@example.com",
  "services": "1,2,3,4,5,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,35,37,65,66,67,68,69,74,75,76,77,78,79",
  "candidate_application_id": "",
  "nationality": "Indian",
  "purpose_of_application": "NORMAL BGV(EMPLOYMENT)",
  "attach_documents": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUh",
    "data:image/png;base64,iVBORw0KGgoAAAANSUh"
  ],
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUh"
});

const requestOptions = {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow"
};

fetch("http://api.goldquestglobal.in/branch/api/candidate-application/create", requestOptions)
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### Response

```json
{
  "status": true,
  "message": "Candidate application created successfully.",
  "data": {
    "access_token": "<ACCESS_TOKEN>",
    "name": "John Doe",
    "employee_id": "EMP12345",
    "spoc": "",
    "location": "",
    "batch_number": "",
    "sub_client": "",
    "services": [
        "1", "2", "3", "4", "5", "7", "8", "9"
        // ...
    ],
    "nationality": "Indian",
    "attach_documents": [
        "data:image/png;base64,iVBORw0KGgoAAAANSUh",
        "data:image/png;base64,iVBORw0KGgoAAAANSUh"
    ],
    "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUh"
  }
}
```

---

## Data Field Descriptions

| Field                      | Type           | Description                                                  |
| -------------------------- | -------------- | ------------------------------------------------------------ |
| `access_token`             | string         | Unique token generated from client portal for authentication |
| `name`                     | string         | Candidate full name                                          |
| `employee_id`              | string         | Unique employee identifier (can be random/alphanumeric)      |
| `mobile_number`            | string         | Candidate mobile number                                      |
| `email`                    | string         | Candidate email address                                      |
| `services`                 | string / array | IDs of services requested by client                          |
| `candidate_application_id` | string         | Optional application ID if updating an existing record       |
| `nationality`              | string         | Candidate nationality                                        |
| `purpose_of_application`   | string         | Purpose of background verification                           |
| `attach_documents`         | array          | Base64 encoded documents (PDF, PNG, JPG)                     |
| `photo`                    | string         | Base64 encoded candidate photo                               |
| `spoc`                     | string         | Single point of contact (optional)                           |
| `location`                 | string         | Candidate location (optional)                                |
| `batch_number`             | string         | Batch number for applications (optional)                     |
| `sub_client`               | string         | Sub-client if applicable (optional)                          |

---

## Notes

1. Always **encode images/documents in Base64** before submitting in the request.
2. Service IDs can be fetched dynamically from the `/services` endpoint.
3. Ensure the `access_token` is valid; expired or invalid tokens will return a `401 Unauthorized` response.
4. The API supports both **single and batch candidate submissions** by sending multiple `services` IDs.

---

**Company:** GoldQuest Global
**Support Email:** [support@goldquestglobal.com](mailto:support@goldquestglobal.com)
