const crypto = require("crypto");
const Customer = require("../../../models/customer/customerModel");
const Service = require("../../../models/admin/serviceModel");
const DeleteRequest = require("../../../models/customer/deleteRequestModel");
const Branch = require("../../../models/customer/branch/branchModel");
const AdminCommon = require("../../../models/admin/commonModel");
const App = require("../../../models/appModel");
const BranchCommon = require("../../../models/customer/branch/commonModel");
const AppModel = require("../../../models/appModel");
const Admin = require("../../../models/admin/adminModel");
const { deleteRequestCertificatePdf } = require("../../../utils/deleteRequestCertificatePdf");
const { createMail } = require("../../../mailer/customer/createMail");

const fs = require("fs");
const path = require("path");
const {
    upload,
    saveImage,
    saveImages,
    deleteFolder,
} = require("../../../utils/cloudImageSave");
const clientApplication = require("../../../models/customer/branch/clientApplicationModel");

// Helper function to generate a password
const generatePassword = (companyName) => {
    const firstName = companyName.split(" ")[0];
    return `${firstName}@123`;
};

// Controller to list all services
exports.list = (req, res) => {
    const { branch_id, sub_user_id, _token } = req.query;

    let missingFields = [];
    if (!branch_id || branch_id === "") missingFields.push("Branch ID");
    if (!_token || _token === "") missingFields.push("Token");

    if (missingFields.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missingFields.join(", ")}`,
        });
    }

    Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
                status: false,
                message: "Failed to retrieve Branch. Please try again.",
            });
        }

        if (!currentBranch) {
            return res.status(404).json({
                status: false,
                message: "Branch not found.",
            });
        }

        if (currentBranch.is_head !== 1) {
            return res.status(403).json({ // 403 Forbidden
                status: false,
                message: "Unauthorized access. Only head branches are allowed.",
            });
        }

        Customer.getCustomerById(currentBranch.customer_id, (err, currentCustomer) => {
            if (err) {
                console.error("Database error during customer retrieval:", err);
                return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve Customer. Please try again.",
                });
            }

            if (!currentCustomer) {
                return res.status(404).json({
                    status: false,
                    message: "Customer not found.",
                });
            }

            const action = "delete_request";
            // Step 1: Check if the branch is authorized for the action
            BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
                if (!authResult.status) {
                    return res.status(403).json({
                        status: false,
                        message: authResult.message,
                    });
                }

                // Step 2: Verify the branch token
                BranchCommon.isBranchTokenValid(
                    _token,
                    sub_user_id || null,
                    branch_id,
                    (tokenErr, tokenResult) => {
                        if (tokenErr) {
                            console.error("Error checking token validity:", tokenErr);
                            return res.status(500).json({
                                status: false,
                                message: tokenErr,
                            });
                        }

                        if (!tokenResult.status) {
                            return res.status(401).json({
                                status: false,
                                message: tokenResult.message,
                            });
                        }

                        const newToken = tokenResult.newToken;
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
        });
    });
};

// Controller to update delete request status
exports.updateStatus = (req, res) => {
    const { request_id, status, branch_id, sub_user_id, _token } = req.body;

    // Validate required fields
    let missingFields = [];
    if (!request_id) missingFields.push("Request ID");
    if (!branch_id) missingFields.push("Branch ID");
    if (!status || !["accepted", "rejected"].includes(status)) missingFields.push("Valid Status (accepted/rejected)");
    if (!_token) missingFields.push("Token");

    if (missingFields.length > 0) {
        return res.status(400).json({
            status: false,
            message: `Missing required fields: ${missingFields.join(", ")}`,
        });
    }

    // Step 1: Get Branch Info
    Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
                status: false,
                message: "Failed to retrieve Branch. Please try again.",
            });
        }

        if (!currentBranch) {
            return res.status(404).json({ status: false, message: "Branch not found." });
        }

        if (currentBranch.is_head !== 1) {
            return res.status(403).json({
                status: false,
                message: "Unauthorized access. Only head branches are allowed.",
            });
        }

        Customer.getCustomerById(currentBranch.customer_id, (err, currentCustomer) => {
            if (err) {
                console.error("Database error during customer retrieval:", err);
                return res.status(500).json({
                    status: false,
                    message: "Failed to retrieve Customer. Please try again.",
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
            // Step 2: Authorization Check
            const action = "delete_request";
            BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
                if (!authResult.status) {
                    return res.status(403).json({ status: false, message: authResult.message });
                }

                // Step 3: Validate Branch Token
                BranchCommon.isBranchTokenValid(_token, sub_user_id || null, branch_id, (tokenErr, tokenResult) => {
                    if (tokenErr) {
                        console.error("Error checking token validity:", tokenErr);
                        return res.status(500).json({
                            status: false,
                            message: "Token validation failed. Please try again.",
                        });
                    }

                    if (!tokenResult.status) {
                        return res.status(401).json({ status: false, message: tokenResult.message });
                    }

                    const newToken = tokenResult.newToken;

                    // Step 4: Update Delete Request Status
                    DeleteRequest.updateStatus(request_id, status, (err, updateResult) => {
                        if (err) {
                            console.error("Database error updating status:", err);
                            return res.status(500).json({
                                status: false,
                                message: "Failed to update status. Please try again.",
                                token: newToken,
                            });
                        }

                        // If status is not "accepted", respond early
                        if (status !== "accepted") {
                            return res.status(200).json({
                                status: true,
                                message: "Response updated successfully.",
                                token: newToken,
                            });
                        }

                        // Step 5: Proceed with Customer Deletion
                        DeleteRequest.delete(request_id, async (err, deleteResult) => {
                            if (err) {
                                console.error("Database error during customer deletion:", err);
                                BranchCommon.branchActivityLog(
                                    branch_id,
                                    "Delete Request",
                                    "Response",
                                    "0",
                                    JSON.stringify({ request_id }),
                                    err.message,
                                    () => { }
                                );

                                return res.status(500).json({
                                    status: false,
                                    message: "Failed to delete customer. Please try again.",
                                    token: newToken,
                                });
                            }

                            console.log("Customer deleted successfully:", deleteResult);

                            // Ensure deleteResult.data and deleteResult.data.branches exist
                            if (deleteResult?.data?.branches) {
                                const clientUniqueId = currentCustomer.client_unique_id;
                                const folderDeletionPromises = [];

                                const today = new Date();
                                const formattedDate = `${today.getFullYear()}-${String(
                                    today.getMonth() + 1
                                ).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

                                const pdfTargetDirectory = `uploads/customers/${clientUniqueId}/delete-request/certificate/`;

                                const pdfFileName = `${currentCustomer.name}_${formattedDate}.pdf`
                                    .replace(/\s+/g, "-")
                                    .toLowerCase();

                                const certificatePdfPath = await deleteRequestCertificatePdf(
                                    deleteResult,
                                    pdfFileName,
                                    pdfTargetDirectory
                                );

                                DeleteRequest.updateCertificate(request_id, certificatePdfPath, (err, updateResult) => {
                                    if (err) {
                                        console.error("Database error updating status:", err);
                                        return res.status(500).json({
                                            status: false,
                                            message: "Failed to update status. Please try again.",
                                            token: newToken,
                                        });
                                    }

                                    deleteResult.data.branches.forEach(branch => {
                                        // console.log(`Branch: ${branch.branchName}`);

                                        if (branch.clientApplications?.length) {
                                            // console.log("Client Applications:");
                                            branch.clientApplications.forEach(app => {
                                                // console.log(`- ${app.name}, ID: ${app.application_id}, Created At: ${app.created_at}`);
                                                folderDeletionPromises.push(
                                                    new Promise(resolve => {
                                                        deleteFolder(`/uploads/customers/${clientUniqueId}/client-applications/${app.application_id}`, (folderErr) => {
                                                            if (folderErr) {
                                                                console.error("Error during folder deletion:", folderErr.message);
                                                                resolve({ error: folderErr.message });
                                                            } else {
                                                                resolve({ success: true });
                                                            }
                                                        });
                                                    })
                                                );
                                            });
                                        }

                                        if (branch.candidateApplications?.length) {
                                            // console.log("Candidate Applications:");
                                            branch.candidateApplications.forEach(app => {
                                                // console.log(`- ${app.name}, ID: ${app.application_id}, Created At: ${app.created_at}`);
                                                folderDeletionPromises.push(
                                                    new Promise(resolve => {
                                                        deleteFolder(`/uploads/customers/${clientUniqueId}/candidate-applications/${app.application_id}`, (folderErr) => {
                                                            if (folderErr) {
                                                                console.error("Error during folder deletion:", folderErr.message);
                                                                resolve({ error: folderErr.message });
                                                            } else {
                                                                resolve({ success: true });
                                                            }
                                                        });
                                                    })
                                                );
                                            });
                                        }
                                    });

                                    Promise.all(folderDeletionPromises).then(results => {
                                        const errors = results.filter(result => result.error);

                                        if (errors.length) {
                                            BranchCommon.branchActivityLog(
                                                branch_id,
                                                "Delete Request",
                                                "Response",
                                                "1",
                                                JSON.stringify({ request_id }),
                                                errors.map(err => err.message).join("; "), // Collect all error messages
                                                () => { }
                                            );

                                            return res.status(200).json({
                                                status: true,
                                                message: "Client and candidate applications were deleted successfully; however, some associated folders could not be removed.",
                                                data: deleteResult,
                                                errors,
                                                certificate,
                                                token: newToken,
                                            });
                                        }

                                        return res.status(200).json({
                                            status: true,
                                            message: "Client and candidate applications, along with all associated folders, were deleted successfully.",
                                            data: deleteResult,
                                            token: newToken,
                                        });
                                    }).catch(err => {
                                        console.error("Error during deletion process:", err);
                                        return res.status(500).json({
                                            status: false,
                                            message: "An error occurred while deleting client and candidate applications.",
                                            error: err.message,
                                        });
                                    });

                                });
                            } else {
                                console.error("Error: 'branches' data is missing or undefined.");
                                return res.status(200).json({
                                    status: true,
                                    message: "Client and candidate applications were deleted successfully, but no branch data was found.",
                                    data: deleteResult,
                                    token: newToken,
                                });
                            }
                        });

                    });
                });
            });
        });
    });
};

