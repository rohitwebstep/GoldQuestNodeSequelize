# 🌐 GoldQuest Background Verification (BGV) API Documentation

> **Version:** 1.0  
> **Base URL:** `http://api.goldquestglobal.in/branch/api/`  
> **Authentication:** Access Token (query/body parameter)

---

## 📘 Overview

The Branch BGV API allows clients to:
1. Retrieve the list of verification services allocated to them.  
2. Create candidate applications and send automatic BGV links to candidates.  
3. Create client applications with direct document uploads for internal verification.

Each API endpoint is REST-based and communicates via JSON.

---

## 🔐 Authentication

All endpoints require an `access_token`.  
It must be passed as:
- A **query parameter** for `GET` requests  
- A **JSON field** in the **request body** for `POST` requests

---

## ⚙️ 1. Get Allocated Services

### **Endpoint**
```bash
GET /branch/api/services

````

### **Query Parameters**
| Parameter | Type | Required | Description |
|------------|------|-----------|--------------|
| `access_token` | `string` | ✅ | Unique token assigned to the client. |

### **Example Request**
```javascript
fetch("http://api.goldquestglobal.in/branch/api/services?access_token=2716fc00ba3179fc4f592d84c0b7f1bd.dc9ddff93c8084eb30f4b50c73293b13", {
  method: "GET",
  redirect: "follow"
})
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error(error));
````

### **Response**

```json
{
    "status": true,
    "message": "Customer allocated services fetched successfully.",
    "data": {
        "services": [
            {
                "id": 1,
                "title": "LATEST EMPLOYMENT-1",
                "group": "Employment"
            },
            {
                "id": 2,
                "title": "EX-EMPLOYMENT-2",
                "group": "Employment"
            },
            {
                "id": 3,
                "title": "PREVIOUS EMPLOYMENT-3",
                "group": "Employment"
            }
        ]
    }
}
```

### **Purpose**

Fetches all BGV (Background Verification) services allocated to the client.

---

## 🧾 2. Create Candidate Application

### **Endpoint**

```bash
POST /branch/api/candidate-application/create
```

### **Headers**

| Key            | Value              |
| -------------- | ------------------ |
| `Content-Type` | `application/json` |

### **Request Body**

| Field                      | Type   | Required | Description                     |
| -------------------------- | ------ | -------- | ------------------------------- |
| `access_token`             | string | ✅        | Client’s access token           |
| `name`                     | string | ✅        | Candidate’s full name           |
| `employee_id`              | string | ✅        | Employee code or identifier     |
| `mobile_number`            | string | ✅        | Candidate’s contact number      |
| `email`                    | string | ✅        | Candidate’s email ID            |
| `services`                 | string | ✅        | Comma-separated service IDs     |
| `nationality`              | string | ✅        | Candidate’s nationality         |
| `purpose_of_application`   | string | ✅        | e.g., “NORMAL BGV (EMPLOYMENT)” |

### **Example Request**

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
    "nationality": "Indian",
    "purpose_of_application": "NORMAL BGV(EMPLOYMENT)"
});

fetch("http://api.goldquestglobal.in/branch/api/candidate-application/create", {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow"
})
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### **Response**

```json
{
  "status": true,
  "message": "Candidate link generated and sent successfully."
}
```

### **Purpose**

Creates a candidate BGV application and automatically sends a verification link to the candidate’s email or mobile.

---

## 🗂️ 3. Create Client Application (With Document Upload)

### **Endpoint**

```bash
POST /branch/api/client-application/create
```

### **Headers**

| Key            | Value              |
| -------------- | ------------------ |
| `Content-Type` | `application/json` |

### **Request Body**

| Field              | Type   | Required | Description                         |
| ------------------ | ------ | -------- | ----------------------------------- |
| `access_token`     | string | ✅        | Client’s access token               |
| `name`             | string | ✅        | Candidate’s full name               |
| `employee_id`      | string | ✅        | Employee code                       |
| `spoc`             | string | ❌        | Single Point of Contact name        |
| `location`         | string | ❌        | Client branch/location              |
| `batch_number`     | string | ❌        | Batch reference if applicable       |
| `sub_client`       | string | ❌        | Sub-client name                     |
| `services`         | array  | ✅        | List of service IDs                 |
| `nationality`      | string | ✅        | Candidate’s nationality             |
| `attach_documents` | array  | ✅        | Base64-encoded supporting documents |
| `photo`            | string | ✅        | Base64-encoded candidate photo      |

### **Example Request**

```javascript
const myHeaders = new Headers();
myHeaders.append("Content-Type", "application/json");

const raw = JSON.stringify({
  "access_token": "<ACCESS_TOKEN>",
  "name": "John Doe",
  "employee_id": "EMP12345",
  "spoc": "",
  "location": "",
  "batch_number": "",
  "sub_client": "",
  "services": ["1", "2", "3", "4"],
  "nationality": "Indian",
  "attach_documents": [
    "data:image/png;base64,iVBORw0KGgoAAAANSUh...",
    "data:image/png;base64,iVBORw0KGgoAAAANSUh..."
  ],
  "photo": "data:image/png;base64,iVBORw0KGgoAAAANSUh..."
});

fetch("http://api.goldquestglobal.in/branch/api/client-application/create", {
  method: "POST",
  headers: myHeaders,
  body: raw,
  redirect: "follow"
})
  .then(response => response.json())
  .then(result => console.log(result))
  .catch(error => console.error(error));
```

### **Response**

```json
{
  "status": "success",
  "message": "Client application created successfully."
}
```

### **Purpose**

Creates a complete BGV application by directly submitting client-uploaded data and documents.

---

## 🧩 Summary

| # | API Name                     | Method | Endpoint                                   | Description                                          |
| - | ---------------------------- | ------ | ------------------------------------------ | ---------------------------------------------------- |
| 1 | Get Allocated Services       | GET    | `/branch/api/services`                     | Fetches list of BGV services available to the client |
| 2 | Create Candidate Application | POST   | `/branch/api/candidate-application/create` | Registers candidate and sends BGV link               |
| 3 | Create Client Application    | POST   | `/branch/api/client-application/create`    | Creates internal BGV record with uploaded documents  |

---

## 🛠️ Error Responses

| Code  | Message                   | Description                              |
| ----- | ------------------------- | ---------------------------------------- |
| `401` | `Invalid access token`    | The provided token is missing or invalid |
| `400` | `Missing required fields` | Some required inputs are not provided    |
| `500` | `Server error`            | Something went wrong on the backend      |