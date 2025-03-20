const crypto = require("crypto");
const Branch = require("../../../models/customer/branch/branchModel");
const Customer = require("../../../models/customer/customerModel");
const BranchCommon = require("../../../models/customer/branch/commonModel");
const AdminCommon = require("../../../models/admin/commonModel");
const Service = require("../../../models/admin/serviceModel");
const clientMasterTracker = require("../../../models/admin/clientMasterTrackerModel");

const generatePassword = (companyName) => {
  const firstName = companyName.split(" ")[0];
  return `${firstName}@123`;
};

exports.index = (req, res) => {
  const { branch_id, sub_user_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!branch_id) missingFields.push("Branch ID");
  if (!_token) missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "sub_user";
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

        // Step 3: Fetch client applications from database
        Branch.index(branch_id, (dbErr, clientApplications) => {
          if (dbErr) {
            console.error("Database error:", dbErr);
            return res.status(500).json({
              status: false,
              message: "An error occurred while fetching client applications.",
              token: newToken,
            });
          }

          // Calculate total application count
          const totalApplicationCount = clientApplications
            ? Object.values(clientApplications).reduce((total, statusGroup) => {
                return total + statusGroup.applicationCount;
              }, 0)
            : 0;

          return res.status(200).json({
            status: true,
            message: "Client applications fetched successfully.",
            clientApplications,
            totalApplicationCount,
            token: newToken,
          });
        });
      }
    );
  });
};

// Controller to list all branches
exports.callbackRequest = (req, res) => {
  const { branch_id, sub_user_id, _token } = req.body;

  let missingFields = [];
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }

  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(
        ", "
      )}. Unable to process the callback request.`,
    });
  }

  // Step 3: Verify the branch token
  BranchCommon.isBranchTokenValid(
    _token,
    sub_user_id || null,
    branch_id,
    (tokenErr, tokenResult) => {
      if (tokenErr) {
        console.error("Error checking token validity:", tokenErr);
        return res.status(500).json({
          status: false,
          message:tokenErr.message,
        });
      }

      if (!tokenResult.status) {
        return res.status(401).json({
          status: false,
          message:
            "Invalid branch token. Unable to process the callback request.",
        });
      }

      Branch.getBranchById(branch_id, (err, currentBranch) => {
        if (err) {
          console.error("Database error during branch retrieval:", err);
          return res.status(500).json({
            status: false,
            message:
              "An error occurred while retrieving the branch details. Please try again.",
          });
        }

        if (!currentBranch) {
          return res.status(404).json({
            status: false,
            message:
              "The specified branch does not exist. Unable to proceed with the callback request.",
          });
        }

        Customer.getCustomerById(
          parseInt(currentBranch.customer_id),
          (err, currentCustomer) => {
            if (err) {
              console.error("Database error during customer retrieval:", err);
              return res.status(500).json({
                status: false,
                message:
                  "An error occurred while retrieving the customer details. Please try again.",
              });
            }

            if (!currentCustomer) {
              return res.status(404).json({
                status: false,
                message:
                  "The associated customer was not found. Unable to process the callback request.",
              });
            }

            Branch.callbackRequest(
              branch_id,
              currentBranch.customer_id,
              (err, result) => {
                if (err) {
                  console.error("Database error:", err);
                  return res.status(500).json({
                    status: false,
                    message:
                      "An error occurred while fetching the callback request. Please try again.",
                  });
                }

                res.status(200).json({
                  status: true,
                  message:
                    "Callback request request successfully sent to the admin from the branch of the customer.",
                });
              }
            );
          }
        );
      });
    }
  );
};

// Controller to list all branches
exports.isEmailUsed = (req, res) => {
  const { email, admin_id, _token } = req.query;

  let missingFields = [];
  if (!email || email === "") missingFields.push("Email");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  // Verify admin token
  AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
    if (err) {
      console.error("Error checking token validity:", err);
      return res.status(500).json({ status: false, message: err.message });
    }

    if (!result.status) {
      return res.status(401).json({ status: false, message: result.message });
    }

    const newToken = result.newToken;

    Branch.isEmailUsed(email, (err, isUsed) => {
      if (err) {
        console.error("Database error:", err);
        return res.status(500).json({
          status: false,
          message: err.message,
          token: newToken,
        });
      }

      if (isUsed) {
        return res.json({
          status: false,
          message: "Email is already in use",
          token: newToken,
        });
      } else {
        return res.json({
          status: true,
          message: "Email is available",
          token: newToken,
        });
      }
    });
  });
};

// Controller to list all branches
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

  const action = "client_management";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, result) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!result.status) {
        return res.status(401).json({ status: false, message: result.message });
      }

      const newToken = result.newToken;

      Branch.list((err, result) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "branches fetched successfully",
          branches: result,
          totalResults: result.length,
          token: newToken,
        });
      });
    });
  });
};

// Controller to list perticular customer branches
exports.listByCustomerID = (req, res) => {
  const { admin_id, customer_id, _token } = req.query;

  let missingFields = [];
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!customer_id || customer_id === "") missingFields.push("Customer ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the message from the authorization function
      });
    }

    // Verify admin token
    AdminCommon.isAdminTokenValid(_token, admin_id, (err, tokenResult) => {
      if (err) {
        console.error("Error checking token validity:", err);
        return res.status(500).json({ status: false, message: err.message });
      }

      if (!tokenResult.status) {
        return res
          .status(401)
          .json({ status: false, message: tokenResult.message });
      }

      const newToken = tokenResult.newToken;

      // Call the model method with customer_id
      Branch.listByCustomerID(customer_id, (err, branches) => {
        if (err) {
          console.error("Database error:", err);
          return res
            .status(500)
            .json({ status: false, message: err.message, token: newToken });
        }

        res.json({
          status: true,
          message: "Branches fetched successfully",
          branches: branches,
          totalResults: branches.length,
          token: newToken,
        });
      });
    });
  });
};

exports.filterOptionsForClientApplications = (req, res) => {
  const { branch_id, sub_user_id, _token } = req.query;

  let missingFields = [];
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }

  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "sub_user";
  // Step 2: Check if the branch is authorized for the action
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the authorization error message
      });
    }
    
    // Step 3: Verify the branch token
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
            message: tokenResult.message, // Return the token validation message
          });
        }

        Branch.filterOptionsForClientApplications(
          branch_id,
          (err, filterOptions) => {
            if (err) {
              console.error("Database error:", err);
              return res.status(500).json({
                status: false,
                message:
                  "An error occurred while fetching Filter options data.",
                error: err,
                token: newToken,
              });
            }

            if (!filterOptions) {
              return res.status(404).json({
                status: false,
                message: "Filter options Data not found.",
                token: newToken,
              });
            }

            res.status(200).json({
              status: true,
              message: "Filter options fetched successfully.",
              filterOptions,
              token: newToken,
            });
          }
        );
      }
    );
  });
};

exports.filterOptionsForCandidateApplications = (req, res) => {
  const { branch_id, sub_user_id, _token } = req.query;

  let missingFields = [];
  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Branch ID");
  }

  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "sub_user";
  // Step 2: Check if the branch is authorized for the action
  BranchCommon.isBranchAuthorizedForAction(branch_id, action, (authResult) => {
    if (!authResult.status) {
      return res.status(403).json({
        status: false,
        message: authResult.message, // Return the authorization error message
      });
    }
    
    // Step 3: Verify the branch token
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
            message: tokenResult.message, // Return the token validation message
          });
        }

        Branch.filterOptionsForCandidateApplications(
          branch_id,
          (err, filterOptions) => {
            if (err) {
              console.error("Database error:", err);
              return res.status(500).json({
                status: false,
                message:
                  "An error occurred while fetching Filter options data.",
                error: err,
                token: newToken,
              });
            }

            if (!filterOptions) {
              return res.status(404).json({
                status: false,
                message: "Filter options Data not found.",
                token: newToken,
              });
            }

            res.status(200).json({
              status: true,
              message: "Filter options fetched successfully.",
              filterOptions,
              token: newToken,
            });
          }
        );
      }
    );
  });
};

// Controller to update a branch
exports.update = (req, res) => {
  const { id, name, email, admin_id, _token } = req.body;

  // Validate required fields
  const missingFields = [];
  if (!id || id === "") missingFields.push("Branch ID");
  if (!name || name === "") missingFields.push("Name");
  if (!email || email === "") missingFields.push("Email");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
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
        const password = generatePassword(name);

        // Fetch the current branch
        Branch.getBranchById(id, (err, currentBranch) => {
          if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Branch. Please try again.",
              token: newToken,
            });
          }

          if (!currentBranch) {
            return res.status(404).json({
              status: false,
              message: "Branch not found.",
              token: newToken,
            });
          }

          // Check if the branch is the head branch
          if (currentBranch.is_head == 1) {
            return res.status(403).json({
              status: false,
              message: "Cannot update the head branch.",
              token: newToken,
            });
          }

          const changes = {};
          if (currentBranch.name !== name) {
            changes.name = { old: currentBranch.name, new: name };
          }
          if (currentBranch.email !== email) {
            changes.email = {
              old: currentBranch.email,
              new: email,
            };
          }

          // Update the branch
          Branch.update(id, name, email, password, (err, result) => {
            if (err) {
              console.error("Database error during branch update:", err);
              AdminCommon.adminActivityLog(
                admin_id,
                "Branch",
                "Update",
                "0",
                JSON.stringify({ id, ...changes }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to update Branch. Please try again.",
                token: newToken,
              });
            }

            AdminCommon.adminActivityLog(
              admin_id,
              "Branch",
              "Update",
              "1",
              JSON.stringify({ id, ...changes }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Branch updated successfully.",
              branch: result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};

exports.active = (req, res) => {
  const { branch_id, admin_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
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

        // Fetch the current branch
        Branch.getBranchById(branch_id, (err, currentBranch) => {
          if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Branch. Please try again.",
              token: newToken,
            });
          }

          if (!currentBranch) {
            return res.status(404).json({
              status: false,
              message: "Branch not found.",
              token: newToken,
            });
          }

          // Check if the branch is the head branch
          if (currentBranch.is_head == 1) {
            return res.status(403).json({
              status: false,
              message: "Cannot update the head branch.",
              token: newToken,
            });
          }

          const changes = {};
          if (currentBranch.status !== 1) {
            changes.status = { old: currentBranch.status, new: 1 };
          }

          // Update the branch
          Branch.active(branch_id, (err, result) => {
            if (err) {
              console.error("Database error during branch status update:", err);
              AdminCommon.adminActivityLog(
                admin_id,
                "Branch",
                "status",
                "0",
                JSON.stringify({ branch_id, ...changes }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to update Branch status. Please try again.",
                token: newToken,
              });
            }

            AdminCommon.adminActivityLog(
              admin_id,
              "Branch",
              "status",
              "1",
              JSON.stringify({ branch_id, ...changes }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Branch status updated successfully.",
              branch: result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};

exports.inactive = (req, res) => {
  const { branch_id, admin_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
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

        // Fetch the current branch
        Branch.getBranchById(branch_id, (err, currentBranch) => {
          if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve Branch. Please try again.",
              token: newToken,
            });
          }

          if (!currentBranch) {
            return res.status(404).json({
              status: false,
              message: "Branch not found.",
              token: newToken,
            });
          }

          // Check if the branch is the head branch
          if (currentBranch.is_head == 1) {
            return res.status(403).json({
              status: false,
              message: "Cannot update the head branch.",
              token: newToken,
            });
          }

          const changes = {};
          if (currentBranch.status !== 0) {
            changes.status = { old: currentBranch.status, new: 0 };
          }

          // Update the branch
          Branch.inactive(branch_id, (err, result) => {
            if (err) {
              console.error("Database error during branch status update:", err);
              AdminCommon.adminActivityLog(
                admin_id,
                "Branch",
                "status",
                "0",
                JSON.stringify({ branch_id, ...changes }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to update Branch status. Please try again.",
                token: newToken,
              });
            }

            AdminCommon.adminActivityLog(
              admin_id,
              "Branch",
              "status",
              "1",
              JSON.stringify({ branch_id, ...changes }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Branch status updated successfully.",
              branch: result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};

exports.delete = (req, res) => {
  const { id, admin_id, _token } = req.query;

  // Validate required fields
  const missingFields = [];
  if (!id || id === "") missingFields.push("Branch ID");
  if (!admin_id || admin_id === "") missingFields.push("Admin ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const action = "client_management";
  // Check admin authorization
  AdminCommon.isAdminAuthorizedForAction(admin_id, action, (result) => {
    if (!result.status) {
      return res.status(403).json({
        status: false,
        message: result.message,
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

        // Fetch the current branch
        Branch.getBranchById(id, (err, currentBranch) => {
          if (err) {
            console.error("Database error during branch retrieval:", err);
            return res.status(500).json({
              status: false,
              message: "Failed to retrieve branch. Please try again.",
              token: newToken,
            });
          }

          if (!currentBranch) {
            return res.status(404).json({
              status: false,
              message: "Branch not found.",
              token: newToken,
            });
          }

          // Check if the branch is the head branch
          if (currentBranch.is_head == 1) {
            return res.status(403).json({
              status: false,
              message: "Cannot delete the head branch.",
              token: newToken,
            });
          }

          // Delete the branch
          Branch.delete(id, (err, result) => {
            if (err) {
              console.error("Database error during branch deletion:", err);
              AdminCommon.adminActivityLog(
                admin_id,
                "Branch",
                "Delete",
                "0",
                JSON.stringify({ id }),
                err,
                () => {}
              );
              return res.status(500).json({
                status: false,
                message: "Failed to delete branch. Please try again.",
                token: newToken,
              });
            }

            AdminCommon.adminActivityLog(
              admin_id,
              "Branch",
              "Delete",
              "1",
              JSON.stringify({ id }),
              null,
              () => {}
            );

            res.status(200).json({
              status: true,
              message: "Branch deleted successfully.",
              result,
              token: newToken,
            });
          });
        });
      }
    );
  });
};

exports.getServiceById = (req, res) => {
  const { id, branch_id, sub_user_id, _token } = req.query;
  let missingFields = [];
  if (!id || id === "") missingFields.push("Service ID");
  if (!branch_id || branch_id === "") missingFields.push("Branch ID");
  if (!_token || _token === "") missingFields.push("Token");

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  
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
          message: tokenResult.message, // Return the token validation message
        });
      }

      const newToken = tokenResult.newToken;

      Service.getServiceById(id, (err, currentService) => {
        if (err) {
          console.error("Error fetching service data:", err);
          return res.status(500).json({
            status: false,
            message: err.message,
            token: newToken,
          });
        }

        if (!currentService) {
          return res.status(404).json({
            status: false,
            message: "Service not found",
            token: newToken,
          });
        }

        res.json({
          status: true,
          message: "Service retrieved successfully",
          service: currentService,
          token: newToken,
        });
      });
    }
  );
};

exports.annexureDataByServiceId = (req, res) => {
  const { service_id, application_id, branch_id, sub_user_id, _token } = req.query;

  let missingFields = [];
  if (
    !service_id ||
    service_id === "" ||
    service_id === undefined ||
    service_id === "undefined"
  ) {
    missingFields.push("Service ID");
  }

  if (
    !application_id ||
    application_id === "" ||
    application_id === undefined ||
    application_id === "undefined"
  ) {
    missingFields.push("Application ID");
  }

  if (
    !branch_id ||
    branch_id === "" ||
    branch_id === undefined ||
    branch_id === "undefined"
  ) {
    missingFields.push("Admin ID");
  }
  if (
    !_token ||
    _token === "" ||
    _token === undefined ||
    _token === "undefined"
  ) {
    missingFields.push("Token");
  }

  if (missingFields.length > 0) {
    return res.status(400).json({
      status: false,
      message: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }
  
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
          message: tokenResult.message, // Return the token validation message
        });
      }

      const newToken = tokenResult.newToken;

      clientMasterTracker.reportFormJsonByServiceID(
        service_id,
        (err, reportFormJson) => {
          if (err) {
            console.error("Error fetching report form JSON:", err);
            return res
              .status(500)
              .json({ status: false, message: err.message, token: newToken });
          }

          if (!reportFormJson) {
            return res.status(404).json({
              status: false,
              message: "Report form JSON not found",
              token: newToken,
            });
          }

          const parsedData = JSON.parse(reportFormJson.json);
          const db_table = parsedData.db_table;
          const heading = parsedData.heading;
          const modifiedDbTable = db_table.replace(/-/g, "_");

          clientMasterTracker.annexureData(
            application_id,
            modifiedDbTable,
            (err, annexureData) => {
              if (err) {
                console.error("Database error:", err);
                return res.status(500).json({
                  status: false,
                  message: "An error occurred while fetching annexure data.",
                  error: err,
                  token: newToken,
                });
              }

              if (!annexureData) {
                return res.status(404).json({
                  status: false,
                  message: "Annexure Data not found.",
                  token: newToken,
                });
              }

              res.status(200).json({
                status: true,
                message: "Application fetched successfully.",
                annexureData,
                heading,
                token: newToken,
              });
            }
          );
        }
      );
    }
  );
};
