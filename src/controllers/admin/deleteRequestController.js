const crypto = require("crypto");
const Customer = require("../../models/customer/customerModel");
const Service = require("../../models/admin/serviceModel");
const DeleteRequest = require("../../models/admin/deleteRequestModel");
const Branch = require("../../models/customer/branch/branchModel");
const AdminCommon = require("../../models/admin/commonModel");
const App = require("../../models/appModel");
const BranchCommon = require("../../models/customer/branch/commonModel");
const AppModel = require("../../models/appModel");
const Admin = require("../../models/admin/adminModel");

const { createMail } = require("../../mailer/customer/createMail");

const fs = require("fs");
const path = require("path");
const {
    upload,
    saveImage,
    saveImages,
    deleteFolder,
} = require("../../utils/cloudImageSave");
const clientApplication = require("../../models/customer/branch/clientApplicationModel");

// Helper function to generate a password
const generatePassword = (companyName) => {
    const firstName = companyName.split(" ")[0];
    return `${firstName}@123`;
};


exports.create = (req, res) => {
    const { id, admin_id, from, to, _token } = req.query;
    // Convert string "true" or boolean true to actual boolean values
    const deleteCandidateApplication = req.query.candidate_applications === true || req.query.candidate_applications === "true";
    const deleteClientApplication = req.query.client_applications === true || req.query.client_applications === "true";

    // Creating the deleteRequestArray
    const deleteRequestArray = {
        clientApplications: deleteClientApplication,
        candidateApplications: deleteCandidateApplication
    };

    // Validate required fields
    const missingFields = [];
    if (!id || id === "") missingFields.push("Customer ID");
    if (!admin_id || admin_id === "") missingFields.push("Admin ID");
    if (!from || from === "") missingFields.push("From date");
    if (!to || to === "") missingFields.push("To Date");
    if (!_token || _token === "") missingFields.push("Token");

    if (missingFields.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missingFields.join(", ")}`,
        });
    }

    const action = "deletion_certification";
    // Check admin authorization
    AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
        if (!result.status) {
            // Check the status returned by the authorization function
            return res.status(403).json({
                status: false,
                message: result.message, // Return the message from the authorization function
            });
        }

        // Validate admin token
        AdminCommon.isAdminTokenValid(
            _token,
            admin_id,
            (err, tokenValidationResult) => {
                if (err) {
                    console.error("Token validation error:", err);
                    return res.status(500).json({
                        status: false,
                        message: err.message,
                    });
                }

                if (!tokenValidationResult.status) {
                    return res.status(401).json({
                        status: false,
                        message: tokenValidationResult.message,
                    });
                }

                const newToken = tokenValidationResult.newToken;

                // Fetch the current customer
                Customer.getCustomerById(id, (err, currentCustomer) => {
                    if (err) {
                        console.error("Database error during customer retrieval:", err);
                        return res.status(500).json({
                            status: false,
                            message: "Failed to retrieve customer. Please try again.",
                            token: newToken,
                        });
                    }

                    if (!currentCustomer) {
                        return res.status(404).json({
                            status: false,
                            message: "Customer not found.",
                            token: newToken,
                        });
                    }

                    // Delete the customer
                    DeleteRequest.create(admin_id, id, from, to, deleteRequestArray, async (err, result) => {
                        if (err) {
                            console.error("Database error during customer deletion:", err);
                            AdminCommon.adminActivityLog(
                                admin_id,
                                "Customer",
                                "Delete",
                                "0",
                                JSON.stringify({ id }),
                                err.message,
                                () => { }
                            );
                            return res.status(500).json({
                                status: false,
                                message:
                                    err.message || "Failed to delete customer. Please try again.",
                                token: newToken,
                            });
                        }

                        console.log(`result - `, result);

                        return res.status(200).json({
                            status: true,
                            message: "Customer deleted successfully, but there was an issue deleting the folder.",
                            result,
                            token: newToken,
                        });

                        return;

                        AdminCommon.adminActivityLog(
                            admin_id,
                            "Customer",
                            "Delete",
                            "1",
                            JSON.stringify({ id }),
                            null,
                            () => { }
                        );

                        const data = result.data;
                        const clientUniqueId = result.client_unique_id;

                        try {
                            // Attempt to delete the folder associated with the customer
                            const folderDeletionResponse = await deleteFolder(`/uploads/customers/${clientUniqueId}`);

                            // Respond with success if customer and folder are deleted successfully
                            return res.status(200).json({
                                status: true,
                                message: "Customer and associated folder deleted successfully.",
                                data,
                                token: newToken,
                            });
                        } catch (error) {
                            // Handle error during folder deletion and log it
                            console.error("Error during folder deletion:", error.message);

                            // Respond with success for customer deletion, but include folder deletion error
                            return res.status(200).json({
                                status: true,
                                message: "Customer deleted successfully, but there was an issue deleting the folder.",
                                data,
                                error: error.message,
                                token: newToken,
                            });
                        }
                    });
                });
            }
        );
    });
};

// Controller to list all services
exports.list = (req, res) => {
    const { admin_id, _token } = req.query;

    let missingFields = [];
    if (!admin_id || admin_id === "") missingFields.push("Admin ID");
    if (!_token || _token === "") missingFields.push("Token");

    if (missingFields.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missingFields.join(", ")}`,
        });
    }
    const action = "deletion_certification";
    // Check admin authorization
    AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
        if (!result.status) {
            // Check the status returned by the authorization function
            return res.status(403).json({
                status: false,
                message: result.message, // Return the message from the authorization function
            });
        }

        // Validate admin token
        AdminCommon.isAdminTokenValid(
            _token,
            admin_id,
            (err, tokenValidationResult) => {
                if (err) {
                    console.error("Token validation error:", err);
                    return res.status(500).json({
                        status: false,
                        message: err.message,
                    });
                }

                if (!tokenValidationResult.status) {
                    return res.status(401).json({
                        status: false,
                        message: tokenValidationResult.message,
                    });
                }

                const newToken = tokenValidationResult.newToken;

                DeleteRequest.list((err, result) => {
                    if (err) {
                        console.error("Database error:", err);
                        return res
                            .status(500)
                            .json({ status: false, message: err.message, token: newToken });
                    }

                    res.json({
                        status: true,
                        message: "Delete Requests fetched successfully",
                        deleteRequests: result,
                        totalResults: result.length,
                        token: newToken,
                    });
                });
            });
    });
};