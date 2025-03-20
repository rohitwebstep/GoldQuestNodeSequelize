const CandidateMasterTrackerModel = require("../models/admin/candidateMasterTrackerModel");
const Admin = require("../models/admin/adminModel");
const Branch = require("../models/customer/branch/branchModel");
const CEF = require("../models/customer/branch/cefModel");
const Customer = require("../models/customer/customerModel");
const AppModel = require("../models/appModel");
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const sharp = require("sharp");
const {
    upload,
    saveImage,
    saveImages,
    savePdf,
} = require("../utils/cloudImageSave");

const LogoBgv = path.join(__dirname, '../../Images/LogoBgv.jpg');

/**
 * Checks if an image exists by making a HEAD request.
 * @param {string} url - Image URL.
 * @returns {Promise<boolean>} - True if image exists, otherwise false.
 */
async function checkImageExists(url) {
    try {
        const response = await axios.head(url);
        return response.status >= 200 && response.status < 300;
    } catch (error) {
        console.error(`❌ Error checking image existence: ${url}`, error.message);
        return false;
    }
}

/**
 * Validates the image and retrieves metadata.
 * @param {string} url - Image URL.
 * @returns {Promise<Object|null>} - Image metadata or null if invalid.
 */
async function validateImage(url) {
    try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        if (response.status !== 200 || !response.data) {
            console.warn(`⚠️ Image fetch failed: ${url} (Status: ${response.status})`);
            return null;
        }

        const buffer = Buffer.from(response.data);
        const metadata = await sharp(buffer).metadata();
        if (!metadata) {
            console.warn(`⚠️ No metadata found for image: ${url}`);
            return null;
        }

        return {
            src: url,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
            buffer: buffer,
        };
    } catch (error) {
        console.error(`❌ Error validating image: ${url}`, error.message);
        return null;
    }
}

/**
 * Fetches an image or an array of images and converts them to Base64.
 * @param {string|string[]} imageUrls - Image URL(s).
 * @returns {Promise<Object[]|null>} - Array of Base64 image data or null on failure.
 */
async function fetchImageAsBase64(imageUrls) {
    try {
        const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        const results = [];

        for (const imageUrl of urls) {
            if (!(await checkImageExists(imageUrl))) {
                console.warn(`⚠️ Image does not exist: ${imageUrl}`);
                continue;
            }

            const imgData = await validateImage(imageUrl);
            if (!imgData) continue;

            results.push({
                imageUrl: imgData.src,
                base64: `data:image/${imgData.format};base64,${imgData.buffer.toString("base64")}`,
                type: imgData.format,
                width: imgData.width,
                height: imgData.height,
            });
        }

        return results.length > 0 ? (imageUrls.length === 1 ? results[0] : results) : null;
    } catch (error) {
        console.error(`❌ Error fetching images as Base64:`, error.message);
        return null;
    }
}

function calculateDateGap(startDate, endDate) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
        return null; // Return null for negative gaps (startDate is later than endDate)
    }

    let years = end.getFullYear() - start.getFullYear();
    let months = end.getMonth() - start.getMonth();

    if (months < 0) {
        years--;
        months += 12;
    }

    return { years: Math.abs(years), months: Math.abs(months) };
}

function calculateGaps(annexureData) {
    // console.log("Received annexureData:", annexureData);

    const secondaryEndDate = annexureData?.gap_validation?.education_fields?.secondary?.secondary_end_date_gap || null;
    // console.log("secondaryEndDate:", secondaryEndDate);

    const seniorSecondaryStartDate = annexureData?.gap_validation?.education_fields?.senior_secondary?.senior_secondary_start_date_gap || null;
    // console.log("seniorSecondaryStartDate:", seniorSecondaryStartDate);

    const seniorSecondaryEndDate = annexureData?.gap_validation?.education_fields?.senior_secondary?.senior_secondary_end_date_gap || null;
    // console.log("seniorSecondaryEndDate:", seniorSecondaryEndDate);

    const graduationStartDate = annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_start_date_gap || null;
    // console.log("graduationStartDate:", graduationStartDate);

    const graduationEndDate = annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_end_date_gap || null;
    // console.log("graduationEndDate:", graduationEndDate);

    const postGraduationStartDate = annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_start_date_gap || null;
    // console.log("postGraduationStartDate:", postGraduationStartDate);

    const postGraduationEndDate = annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_end_date_gap || null;
    // console.log("postGraduationEndDate:", postGraduationEndDate);

    const phdStartDate = annexureData?.gap_validation?.education_fields?.phd_1?.phd_start_date_gap || null;
    // console.log("phdStartDate:", phdStartDate);

    const validGaps = {
        gapSecToSrSec: calculateDateGap(secondaryEndDate, seniorSecondaryStartDate),
        gapSrSecToGrad: calculateDateGap(seniorSecondaryEndDate, graduationStartDate),
        gapGradToPostGrad: calculateDateGap(graduationEndDate, postGraduationStartDate),
        gapPostGradToPhd: calculateDateGap(postGraduationEndDate, phdStartDate)
    };
    // console.log("Calculated validGaps:", validGaps);

    const nonNegativeGaps = Object.fromEntries(
        Object.entries(validGaps).filter(([_, value]) => value !== null)
    );
    // console.log("Filtered nonNegativeGaps:", nonNegativeGaps);

    function getEmploymentDates(data) {
        // console.log("Extracting employment dates from:", data);

        const employmentStartDates = [];
        const employmentEndDates = [];
        let i = 1;
        const employmentValues = data?.gap_validation?.employment_fields;

        if (!employmentValues) {
            // console.log("No employment fields found.");
            return { employmentStartDates, employmentEndDates };
        }

        while (true) {
            const employmentKey = `employment_${i}`;
            const employmentData = employmentValues[employmentKey];

            if (!employmentData) break;

            if (employmentData.employment_start_date_gap) {
                employmentStartDates.push({
                    name: `employment_start_date_gap_${i}`,
                    value: employmentData.employment_start_date_gap
                });
                // console.log(`Added employment start date:`, employmentStartDates[employmentStartDates.length - 1]);
            }
            if (employmentData.employment_end_date_gap) {
                employmentEndDates.push({
                    name: `employment_end_date_gap_${i}`,
                    value: employmentData.employment_end_date_gap
                });
                // console.log(`Added employment end date:`, employmentEndDates[employmentEndDates.length - 1]);
            }
            i++;
        }

        return { employmentStartDates, employmentEndDates };
    }

    const { employmentStartDates, employmentEndDates } = getEmploymentDates(annexureData);
    // console.log("Extracted employmentStartDates:", employmentStartDates);
    // console.log("Extracted employmentEndDates:", employmentEndDates);

    function getEmploymentDateDifferences(startDates, endDates) {
        // console.log("Calculating employment date differences...");
        return endDates.map((endDate, i) => {
            const nextStart = startDates[i + 1]?.value || null;
            // console.log(`Processing endDate: ${endDate.value}, nextStart: ${nextStart}`);

            if (endDate.value && nextStart && endDate.value !== nextStart) {
                const diff = calculateDateDifference(endDate.value, nextStart);
                // console.log(`Gap found: ${endDate.value} to ${nextStart} - Difference:`, diff);
                return {
                    endName: endDate.name,
                    endValue: endDate.value,
                    startName: startDates[i + 1].name,
                    startValue: nextStart,
                    difference: diff
                };
            }
            return null;
        }).filter(Boolean);
    }

    const employmentGaps = getEmploymentDateDifferences(employmentStartDates, employmentEndDates);
    // console.log("Final employment gaps:", employmentGaps);
}

module.exports = {
    candidateFormPDF: async (
        candidate_applicaton_id,
        branch_id,
        pdfFileName,
        targetDirectory
    ) => {
        return new Promise((resolve, reject) => {
            console.log(`DEBUG: Calling applicationListByBranchByCandidateID for ID: ${candidate_applicaton_id}`);

            CandidateMasterTrackerModel.applicationListByBranchByCandidateID(
                candidate_applicaton_id,
                branch_id,
                async (err, application) => {
                    if (err) {
                        console.error("Database error:", err);
                        return reject(new Error(`Database error: ${err.message}`));
                    }

                    if (!application) {
                        console.warn("Application not found");
                        return reject(new Error("Application not found"));
                    }

                    console.log(`application - `, application);

                    console.log(`Step 1: Application data fetched for ID: ${candidate_applicaton_id}`);

                    CandidateMasterTrackerModel.applicationByID(
                        candidate_applicaton_id,
                        branch_id,
                        (err, application) => {
                            if (err) {
                                console.error("Database error:", err);
                                return res
                                    .status(500)
                                    .json({ status: false, message: err.message, token: newToken });
                            }

                            if (!application) {
                                return res.status(404).json({
                                    status: false,
                                    message: "Application not found",
                                    token: newToken,
                                });
                            }

                            const service_ids = Array.isArray(application.services)
                                ? application.services
                                : application.services.split(",").map((item) => item.trim());

                            CandidateMasterTrackerModel.cefApplicationByID(
                                candidate_applicaton_id,
                                branch_id,
                                (err, CEFApplicationData) => {
                                    if (err) {
                                        console.error("Database error:", err);
                                        return res.status(500).json({
                                            status: false,
                                            message: err.message,
                                            token: newToken,
                                        });
                                    }

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

                                        Admin.list((err, adminList) => {
                                            if (err) {
                                                console.error("Database error:", err);
                                                return res.status(500).json({
                                                    status: false,
                                                    message: err.message,
                                                    token: newToken,
                                                });
                                            }
                                            Customer.getCustomerById(
                                                parseInt(currentBranch.customer_id),
                                                (err, currentCustomer) => {
                                                    if (err) {
                                                        console.error(
                                                            "Database error during customer retrieval:",
                                                            err
                                                        );
                                                        return res.status(500).json({
                                                            status: false,
                                                            message:
                                                                "Failed to retrieve Customer. Please try again.",
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

                                                    CEF.formJsonWithData(
                                                        service_ids,
                                                        candidate_applicaton_id,
                                                        async (err, serviceData) => {
                                                            if (err) {
                                                                console.error("Database error:", err);
                                                                return res.status(500).json({
                                                                    status: false,
                                                                    message:
                                                                        "An error occurred while fetching service form json.",
                                                                    token: newToken,
                                                                });
                                                            }
                                                            data = {
                                                                application,
                                                                CEFData: CEFApplicationData,
                                                                branchInfo: currentBranch,
                                                                customerInfo: currentCustomer,
                                                                serviceData,
                                                                admins: adminList,
                                                            };

                                                            customBgv = data.customerInfo?.is_custom_bgv || '';
                                                            companyName = data.application?.customer_name || '';
                                                            purpose = data.application?.purpose_of_application || '';
                                                            cefData = data.CEFData || {};
                                                            nationality = data.application?.nationality || '';
                                                            isSameAsPermanent = false

                                                            const parsedData = data?.serviceData || [];
                                                            try {
                                                                // Create a new PDF document
                                                                calculateGaps();
                                                                const doc = new jsPDF();
                                                                let yPosition = 10;  // Initial y position

                                                                // Add the form title

                                                                if (customBgv === 1) {
                                                                    doc.addImage(LogoBgv, 'PNG', 75, yPosition, 60, 10);
                                                                }
                                                                // Set font size for the title
                                                                doc.setFontSize(20);  // Sets the font size to 20
                                                                doc.setFont("helvetica", "bold");  // Sets the font to Helvetica and makes it bold
                                                                // Calculate the width of the text
                                                                const title = 'Background Verification Form';
                                                                const titleWidth = doc.getStringUnitWidth(title) * doc.internal.getFontSize() / doc.internal.scaleFactor;
                                                                const xPosition = (doc.internal.pageSize.width - titleWidth) / 2;
                                                                // Calculate the x-coordinate for centering


                                                                // Add the text in the center of the page
                                                                doc.text(title, xPosition, customBgv === 1 ? yPosition + 20 : yPosition + 10);

                                                                // Move yPosition down for the next content
                                                                yPosition += 20; // Adjust spacing as needed

                                                                // Add Company Name
                                                                doc.setFontSize(10);
                                                                doc.setFont("helvetica", "normal");
                                                                // Set the left position for "Company name"
                                                                doc.text(`Company name: ${companyName}`, 10, yPosition + 10);

                                                                // Set the right position for "Purpose of Application"
                                                                const pageWidth = doc.internal.pageSize.width; // Get the page width
                                                                const marginRight = 10; // Right margin
                                                                const purposeXPosition = pageWidth - marginRight - doc.getTextWidth(`Purpose of Application: ${purpose || 'NIL'}`);

                                                                doc.text(`Purpose of Application: ${purpose || 'NIL'}`, purposeXPosition, yPosition + 10);

                                                                yPosition += 20; // Move yPosition down for the next section

                                                                const imageWidth = doc.internal.pageSize.width - 10; // 20px padding for margins
                                                                const imageHeight = 80; // Fixed height of 500px for the image
                                                                doc.setFontSize(16);
                                                                doc.setFont("helvetica", "bold");
                                                                if (purpose === 'NORMAL BGV(EMPLOYMENT)') {
                                                                    // Add a form group with Applicant's CV label
                                                                    doc.setFontSize(12);
                                                                    doc.text("Applicant’s CV", doc.internal.pageSize.width / 2, yPosition, {
                                                                        align: 'center'
                                                                    });

                                                                    if (cefData && cefData.resume_file) {
                                                                        // Check if the file is an image (this can be enhanced with MIME type checks, e.g., 'image/png', 'image/jpeg')
                                                                        const resumeFile = cefData.resume_file.trim();

                                                                        if (isImage(resumeFile)) {
                                                                            // If the resume file is an image, fetch and add it to the document
                                                                            const imageBases = await fetchImageToBase([resumeFile]);

                                                                            if (imageBases?.[0]?.base64) {
                                                                                doc.addImage(imageBases?.[0]?.base64, 'PNG', 5, yPosition + 10, imageWidth, imageHeight);
                                                                            } else {
                                                                                doc.text("Unable to load image.", 10, 40);
                                                                            }
                                                                        } else {
                                                                            const doctext = 'View Document';
                                                                            const doctextWidth = doc.getTextWidth(doctext);
                                                                            const noCVTextX = (doc.internal.pageSize.width - doctextWidth) / 2;
                                                                            const resumeUrl = resumeFile;
                                                                            doc.setTextColor(255, 0, 0); // Set the text color to blue (like a link)
                                                                            doc.textWithLink(doctext, noCVTextX, 60, { url: resumeUrl });  // Opens the document in a new tab
                                                                        }
                                                                    } else {
                                                                        // If no resume file is available, center the text for "No CV uploaded."
                                                                        const noCVText = "No CV uploaded.";
                                                                        const noCVTextWidth = doc.getTextWidth(noCVText);
                                                                        const noCVTextX = (doc.internal.pageSize.width - noCVTextWidth) / 2;

                                                                        doc.text(noCVText, noCVTextX + 40, 40);
                                                                    }


                                                                    // Helper function to determine if the file is an image (you can improve this with more MIME type checks)
                                                                    function isImage(fileName) {
                                                                        const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];
                                                                        return imageExtensions.some(extension => fileName.toLowerCase().endsWith(extension));
                                                                    }

                                                                }
                                                                doc.setTextColor(0, 0, 0);
                                                                if (purpose === 'NORMAL BGV(EMPLOYMENT)') {
                                                                    yPosition += imageHeight + 10;
                                                                }
                                                                yPosition += 5;
                                                                if (cefData && cefData.govt_id) {
                                                                    // Split the comma-separated string into an array of image URLs
                                                                    const govtIdUrls = cefData.govt_id.split(',').map(url => url.trim());

                                                                    // Check if there are any URLs in the array
                                                                    if (govtIdUrls.length > 0) {
                                                                        for (let i = 0; i < govtIdUrls.length; i++) {
                                                                            const govtIdUrl = govtIdUrls[i];

                                                                            // Fetch the image as base64
                                                                            const imageBases = await fetchImageToBase([govtIdUrl]);

                                                                            // Check if the image is valid
                                                                            if (imageBases?.[0]?.base64) {
                                                                                // Set font size and add the label for each image
                                                                                doc.setFontSize(12);
                                                                                const labelText = "Govt ID #" + (i + 1);
                                                                                const labelTextWidth = doc.getTextWidth(labelText);
                                                                                const labelCenterX = (doc.internal.pageSize.width - labelTextWidth) / 2;

                                                                                // Add label at the center for each image
                                                                                doc.text(labelText, labelCenterX, yPosition);

                                                                                // Add image to the document (ensure image fits properly)
                                                                                const imageWidth = doc.internal.pageSize.width - 10; // 20px padding for margins
                                                                                let imageHeight = 100; // Adjust according to your requirements
                                                                                if (yPosition > doc.internal.pageSize.height - 40) {
                                                                                    doc.addPage(); // Add a new page
                                                                                    imageHeight = 150;
                                                                                    yPosition = 20; // Reset yPosition for new page
                                                                                }
                                                                                doc.addImage(imageBases[0].base64, 'PNG', 5, yPosition + 5, imageWidth, imageHeight);

                                                                                // Update yPosition after adding the image
                                                                                yPosition += imageHeight + 10; // Adjust for image height + some margin

                                                                                // Check if the yPosition exceeds the page height, and if so, add a new page

                                                                            } else {
                                                                                // If no image is found for this govt_id, center the message
                                                                                const messageText = "Image #" + (i + 1) + " not found.";
                                                                                const messageTextWidth = doc.getTextWidth(messageText);
                                                                                const messageCenterX = (doc.internal.pageSize.width - messageTextWidth) / 2;

                                                                                doc.text(messageText, messageCenterX, yPosition);

                                                                                // Update yPosition after showing the message
                                                                                yPosition += 20 + 30; // Adjust for message height + margin

                                                                                // Check if the yPosition exceeds the page height, and if so, add a new page
                                                                                if (yPosition > doc.internal.pageSize.height - 40) {
                                                                                    doc.addPage();
                                                                                    imageHeight = 150;// Add a new page
                                                                                    yPosition = 20; // Reset yPosition for new page
                                                                                }
                                                                            }
                                                                        }
                                                                    } else {
                                                                        // If no government ID images are available in the string, center the message
                                                                        const noImagesText = "No Government ID images uploaded.";
                                                                        const noImagesTextWidth = doc.getTextWidth(noImagesText);
                                                                        const noImagesCenterX = (doc.internal.pageSize.width - noImagesTextWidth) / 2;

                                                                        doc.text(noImagesText, noImagesCenterX, 40);
                                                                    }
                                                                } else {
                                                                    // If govt_id is not present in cefData, center the message
                                                                    const noGovtIdText = "No Government ID uploaded.";
                                                                    const noGovtIdTextWidth = doc.getTextWidth(noGovtIdText);
                                                                    const noGovtIdCenterX = (doc.internal.pageSize.width - noGovtIdTextWidth) / 2;

                                                                    doc.text(noGovtIdText, noGovtIdCenterX, 40);
                                                                }





                                                                if (customBgv === 1) {
                                                                    doc.addPage();
                                                                }
                                                                const passport_photoHeight = 62;
                                                                yPosition = 10;

                                                                if (customBgv === 1) {
                                                                    // Center the "Passport Photo" header
                                                                    const headerText = "Passport Photo.";
                                                                    doc.text(headerText, doc.internal.pageSize.width / 2, yPosition, { align: 'center' });

                                                                    if (cefData && cefData.passport_photo) {
                                                                        // Split the comma-separated image URLs into an array
                                                                        const imageUrls = cefData.passport_photo.trim().split(',').map(url => url.trim());

                                                                        // Filter valid image URLs based on file extensions
                                                                        const validImageUrls = imageUrls.filter(url => {
                                                                            const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                                                                            return validImageExtensions.some(ext => url.toLowerCase().endsWith(ext));
                                                                        });

                                                                        if (validImageUrls.length > 0) {
                                                                            // Constants for grid layout
                                                                            const cols = validImageUrls.length > 3 ? 3 : validImageUrls.length;  // Limit to 3 columns at most
                                                                            const margin = 5;  // Space between images
                                                                            const xStart = 5;  // Starting x position
                                                                            const yStart = yPosition + 10;  // Starting y position (below the header)
                                                                            const pageWidth = doc.internal.pageSize.width; // Get the page width

                                                                            let xPos = xStart;
                                                                            yPosition = yStart;

                                                                            // Dynamically calculate the image width based on the number of images
                                                                            const imageWidth = validImageUrls.length === 1 ? pageWidth - 2 * margin :
                                                                                validImageUrls.length === 2 ? (pageWidth / 2) - margin :
                                                                                    validImageUrls.length === 3 ? (pageWidth / 3) - margin :
                                                                                        (pageWidth / 3) - margin; // Use 3 columns for more than 3 images

                                                                            // Loop through each valid image URL and process it
                                                                            for (let i = 0; i < validImageUrls.length; i++) {
                                                                                const imageUrl = validImageUrls[i];
                                                                                try {
                                                                                    // Fetch the base64 image for each URL
                                                                                    const imageBases = await fetchImageToBase([imageUrl]);

                                                                                    if (imageBases && imageBases[0]?.base64) {
                                                                                        // Add image to the PDF at the correct xPos and yPosition (grid layout)
                                                                                        doc.addImage(imageBases[0].base64, imageBases[0].type, xPos, yPosition, imageWidth, passport_photoHeight);

                                                                                        // Update xPos for the next image (move horizontally)
                                                                                        xPos += imageWidth + margin;

                                                                                        // If we have reached the end of the row (3 columns), reset xPos and move to the next row
                                                                                        if ((i + 1) % cols === 0) {
                                                                                            xPos = xStart;
                                                                                            yPosition += passport_photoHeight + margin;  // Move to the next row
                                                                                        }
                                                                                    } else {
                                                                                        console.error(`Image at index ${i} could not be loaded.`);
                                                                                        const imageNotFoundText = `Image #${i + 1} not found.`;
                                                                                        const imageNotFoundTextWidth = doc.getTextWidth(imageNotFoundText);
                                                                                        const imageNotFoundCenterX = (doc.internal.pageSize.width - imageNotFoundTextWidth) / 2;
                                                                                        doc.text(imageNotFoundText, imageNotFoundCenterX, yPosition + 10);
                                                                                        yPosition += 10;  // Update yPos for the error message
                                                                                    }
                                                                                } catch (error) {
                                                                                    console.error(`Error loading image at index ${i}:`, error);
                                                                                    const errorMessage = `Error loading image #${i + 1}.`;
                                                                                    const errorTextWidth = doc.getTextWidth(errorMessage);
                                                                                    const errorTextCenterX = (doc.internal.pageSize.width - errorTextWidth) / 2;
                                                                                    doc.text(errorMessage, errorTextCenterX, yPosition + 10);
                                                                                    yPosition += 20;  // Update yPos for the error message
                                                                                }
                                                                            }
                                                                        } else {
                                                                            // If no valid image URLs are found, display a message
                                                                            const noImagesText = "No valid Passport Photo images found.";
                                                                            const noImagesTextWidth = doc.getTextWidth(noImagesText);
                                                                            const noImagesCenterX = (doc.internal.pageSize.width - noImagesTextWidth) / 2;
                                                                            doc.text(noImagesText, noImagesCenterX, yPosition + 10);
                                                                            yPosition += 20; // Adjust for the message
                                                                        }

                                                                    } else {
                                                                        // If no passport photo is available, display a message
                                                                        const noPhotoText = "No Passport Photo uploaded.";
                                                                        const noPhotoTextWidth = doc.getTextWidth(noPhotoText);
                                                                        const noPhotoCenterX = (doc.internal.pageSize.width - noPhotoTextWidth) / 2;
                                                                        doc.text(noPhotoText, noPhotoCenterX, yPosition + 10);
                                                                        yPosition += 20; // Adjust position for the message
                                                                    }
                                                                }






                                                                const tableData = [
                                                                    { title: "Full Name", value: cefData.full_name || "N/A" },
                                                                    { title: "Former Name / Maiden Name", value: cefData.former_name || "N/A" },
                                                                    { title: "Mobile Number", value: cefData.mb_no || "N/A" },
                                                                    { title: "Father's Name", value: cefData.father_name || "N/A" },
                                                                    { title: "Spouse's Name", value: cefData.husband_name || "N/A" },
                                                                    { title: "Date of Birth", value: cefData.dob || "N/A" },
                                                                    { title: "Gender", value: cefData.gender || "N/A" },
                                                                    // Add conditional fields based on customBgv and nationality
                                                                ];

                                                                // Conditionally add fields
                                                                if (customBgv === 1 && nationality === "Indian") {
                                                                    tableData.push(
                                                                        { title: "Name as per Aadhar", value: cefData.aadhar_card_name || "N/A" },
                                                                        { title: "Name as per Pan Card", value: cefData.pan_card_name || "N/A" }
                                                                    );
                                                                }

                                                                if (nationality === "Other") {
                                                                    tableData.push(
                                                                        { title: "Passport No", value: cefData.passport_no || "N/A" },
                                                                        { title: "Driving License / Resident Card / ID No", value: cefData.dme_no || "N/A" },
                                                                        { title: "Tax No", value: cefData.tax_no || "N/A" }
                                                                    );
                                                                }
                                                                if (customBgv == 0 && nationality === "Other") {
                                                                    tableData.push(
                                                                        { title: "Social Security Number", value: cefData.ssn_number || "N/A" },
                                                                    );
                                                                }

                                                                tableData.push(
                                                                    { title: "Aadhar Card Number", value: cefData.aadhar_card_number || "N/A" },
                                                                    { title: "Pan Card Number", value: cefData.pan_card_number || "N/A" },
                                                                    { title: "Nationality", value: cefData.nationality || "N/A" },
                                                                    { title: "Marital Status", value: cefData.marital_status || "N/A" }
                                                                );



                                                                doc.addPage();
                                                                yPosition = 20;


                                                                doc.autoTable({
                                                                    startY: yPosition + 5, // Start the table just below the last added entry
                                                                    head: [[{ content: 'Personal Information', colSpan: 2, styles: { halign: 'center', fontSize: 16, bold: true } }],
                                                                    ],
                                                                    body: tableData.map(row => {
                                                                        return [row.title, row.value];
                                                                    }),
                                                                    theme: 'grid',
                                                                    margin: { top: 10 },
                                                                    styles: {
                                                                        cellPadding: 3,        // Padding around text for a cleaner look
                                                                        fontSize: 10,          // Font size for better readability
                                                                        halign: 'left',        // Align text to the left for better structure
                                                                        valign: 'middle',      // Align vertically to the middle of the cells
                                                                        lineWidth: 0.2,        // Increase line width for better visibility
                                                                        font: 'helvetica'      // Use Helvetica for better font rendering
                                                                    },
                                                                    headStyles: {
                                                                        textColor: 255,        // White text for header for contrast
                                                                        fontStyle: 'bold',     // Make header text bold
                                                                    },
                                                                    columnStyles: {
                                                                        0: { cellWidth: 'auto' },  // Auto width for the first column (Field)
                                                                        1: { cellWidth: 'auto' }   // The second column (Value) should adjust width automatically
                                                                    }
                                                                });




                                                                const aadharcardimageHeight = 100;
                                                                yPosition = doc.autoTable.previous.finalY + 10;

                                                                if (customBgv === 1 && nationality === "Indian") {
                                                                    // Add Aadhaar card image if available
                                                                    if (cefData.aadhar_card_image) {
                                                                        doc.addPage();
                                                                        let yPosition = 10; // Reset yPosition for a new page
                                                                        doc.setTextColor(0, 0, 0);
                                                                        // Center the "Aadhar Card Image" header
                                                                        doc.text('Aadhar Card Image', doc.internal.pageSize.width / 2, yPosition + 10, {
                                                                            align: 'center'
                                                                        });

                                                                        // Process Aadhaar card image
                                                                        const imageUrls = [cefData.aadhar_card_image.trim()];
                                                                        const imageUrlsToProcess = imageUrls.filter(url => {
                                                                            const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                                                                            return validImageExtensions.some(ext => url.toLowerCase().endsWith(ext));
                                                                        });

                                                                        // If it's an image, add to PDF
                                                                        if (imageUrlsToProcess.length > 0) {
                                                                            const imageBases = await fetchImageToBase(imageUrlsToProcess);
                                                                            doc.addImage(imageBases[0]?.base64, imageBases[0]?.type, 5, yPosition + 20, imageWidth, aadharcardimageHeight);
                                                                            yPosition += aadharcardimageHeight;
                                                                        } else {
                                                                            // If not an image (e.g., PDF or XLS), show a clickable link centered
                                                                            const fileUrl = cefData.aadhar_card_image.trim();
                                                                            const buttonText = `Click to open Aadhar Card File`;
                                                                            const textWidth = doc.getTextWidth(buttonText);
                                                                            const centerX = (doc.internal.pageSize.width - textWidth) / 2;

                                                                            doc.setFont("helvetica", "normal");
                                                                            doc.setFontSize(10);
                                                                            doc.setTextColor(255, 0, 0);
                                                                            doc.text(buttonText, centerX, yPosition + 20);

                                                                            // Create clickable link to open the file
                                                                            doc.link(centerX, yPosition + 10, textWidth, 10, { url: fileUrl });

                                                                            yPosition += 20;
                                                                        }
                                                                    }

                                                                    yPosition = aadharcardimageHeight + 40;
                                                                    if (cefData.pan_card_image) {
                                                                        // Center the "Pan Card Image" header
                                                                        doc.setTextColor(0, 0, 0);
                                                                        doc.text('Pan Card Image', doc.internal.pageSize.width / 2, yPosition + 10, {
                                                                            align: 'center'
                                                                        });

                                                                        const imageUrls = [cefData.pan_card_image.trim()];
                                                                        const imageUrlsToProcess = imageUrls.filter(url => {
                                                                            const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                                                                            return validImageExtensions.some(ext => url.toLowerCase().endsWith(ext));
                                                                        });

                                                                        // If it's an image, add to PDF
                                                                        if (imageUrlsToProcess.length > 0) {
                                                                            const imageBases = await fetchImageToBase(imageUrlsToProcess);
                                                                            doc.addImage(imageBases[0]?.base64, imageBases[0]?.type, 5, yPosition + 20, imageWidth, aadharcardimageHeight);
                                                                            yPosition += aadharcardimageHeight + 20;
                                                                        } else {
                                                                            // If not an image (e.g., PDF or XLS), show a clickable link centered
                                                                            const fileUrl = cefData.pan_card_image.trim();
                                                                            const buttonText = `Click to open Pan Card File`;
                                                                            const textWidth = doc.getTextWidth(buttonText);
                                                                            const centerX = (doc.internal.pageSize.width - textWidth) / 2;

                                                                            doc.setFont("helvetica", "normal");
                                                                            doc.setFontSize(10);
                                                                            doc.setTextColor(255, 0, 0);
                                                                            doc.text(buttonText, centerX, yPosition + 20);

                                                                            // Create clickable link to open the file
                                                                            doc.link(centerX, yPosition + 10, textWidth, 10, { url: fileUrl });

                                                                            yPosition += 20;
                                                                        }
                                                                    }
                                                                }


                                                                else {
                                                                    yPosition = doc.autoTable.previous.finalY + 10;
                                                                }

                                                                if (customBgv === 1 && nationality === "Indian") {
                                                                    doc.addPage();
                                                                    yPosition = 10;
                                                                }

                                                                doc.setFontSize(14);
                                                                yPosition += 10; // Move yPosition down for the next section

                                                                // Table for Permanent Address
                                                                doc.autoTable({
                                                                    startY: yPosition,
                                                                    head: [[{ content: 'Permanent Address', colSpan: 2, styles: { halign: 'center', fontSize: 16, bold: true } }],
                                                                    ],
                                                                    body: [
                                                                        ['Permanent Address', cefData.permanent_address || 'N/A'],
                                                                        ['Pin Code', cefData.permanent_pin_code || 'N/A'],
                                                                        ['Mobile Number', cefData.permanent_address_landline_number || 'N/A'],
                                                                        ['Current State', cefData.permanent_address_state || 'N/A'],
                                                                        ['Current Landmark', cefData.permanent_prominent_landmark || 'N/A'],
                                                                        ['Current Address Stay No.', cefData.permanent_address_stay_to || 'N/A'],
                                                                        ['Nearest Police Station', cefData.permanent_address_nearest_police_station || 'N/A']
                                                                    ],
                                                                    theme: 'grid',
                                                                    margin: { top: 10 },
                                                                    styles: { fontSize: 10, cellPadding: 3 }
                                                                });

                                                                // Update yPosition after the permanent address table
                                                                yPosition = doc.autoTable.previous.finalY + 20; // Add a small margin after the table

                                                                // Check if current address is different from permanent address
                                                                if (!isSameAsPermanent) {
                                                                    // Table for Current Address if not same as Permanent Address
                                                                    doc.autoTable({
                                                                        startY: yPosition,
                                                                        head: [[{ content: 'Current Address', colSpan: 2, styles: { halign: 'center', fontSize: 16, bold: true } }],
                                                                        ],
                                                                        body: [
                                                                            ['Current Address', cefData.current_address || 'N/A'],
                                                                            ['Pin Code', cefData.current_address_pin_code || 'N/A'],
                                                                            ['Mobile Number', cefData.current_address_landline_number || 'N/A'],
                                                                            ['Current State', cefData.current_address_state || 'N/A'],
                                                                            ['Current Landmark', cefData.current_prominent_landmark || 'N/A'],
                                                                            ['Current Address Stay No.', cefData.current_address_stay_to || 'N/A'],
                                                                            ['Nearest Police Station', cefData.current_address_nearest_police_station || 'N/A']
                                                                        ],
                                                                        theme: 'grid',
                                                                        margin: { top: 10 },
                                                                        styles: { fontSize: 10, cellPadding: 3 }
                                                                    });

                                                                    // Update yPosition after the current address table
                                                                    yPosition = doc.autoTable.previous.finalY + 10; // Add a small margin after the table
                                                                }


                                                                yPosition = doc.autoTable.previous.finalY + 10;


                                                                doc.addPage();
                                                                let newYPosition = 20
                                                                doc.autoTable({
                                                                    head: [[{ content: 'Declaration and Authorization', colSpan: 2, styles: { halign: 'center', fontSize: 16, bold: true } }],
                                                                    ], // Table headers
                                                                    body: [
                                                                        ['Name', cefData.name_declaration],
                                                                        ['Date', cefData.declaration_date],
                                                                    ],
                                                                    startY: newYPosition, // Starting Y position
                                                                    margin: { top: 20 }, // Margin for the table
                                                                    theme: 'grid', // You can change the table theme (grid, stripes, etc.)
                                                                });




                                                                newYPosition = doc.autoTable.previous.finalY + 20; // Adjusting for space from the last table

                                                                doc.text("Attach Signature.", doc.internal.pageSize.width / 2, newYPosition, { align: 'center' });

                                                                const lineHeight = 10;
                                                                const margin = 10;
                                                                const DocHeight = 100; // Height for images (adjust as needed)

                                                                // Check if the signature exists
                                                                if (cefData && cefData.signature) {
                                                                    // Check if the signature is an image
                                                                    const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                                                                    const isImage = validImageExtensions.some(ext => cefData.signature.toLowerCase().endsWith(ext));

                                                                    if (isImage) {
                                                                        // Fetch the base64 image
                                                                        const imageBases = await fetchImageToBase([cefData.signature]);

                                                                        // Assuming imageBases[0] exists and contains the base64 string
                                                                        if (imageBases && imageBases[0] && imageBases[0].base64) {
                                                                            const imageBase64 = imageBases[0].base64;
                                                                            const imageWidth = doc.internal.pageSize.width - 10; // 20px padding for margins

                                                                            // Add the image to the PDF
                                                                            doc.addImage(imageBase64, 'PNG', 5, newYPosition + 20, imageWidth, DocHeight);
                                                                            newYPosition += DocHeight + 20; // Update the position after the image
                                                                        }
                                                                    } else {
                                                                        // If not an image, show a clickable button to view the document
                                                                        const buttonText = "Click to view attached document";
                                                                        const textWidth = doc.getTextWidth(buttonText);
                                                                        const centerX = (doc.internal.pageSize.width - textWidth) / 2;

                                                                        // Add the text at the center
                                                                        doc.setFont("helvetica", "normal");
                                                                        doc.setFontSize(10);
                                                                        doc.setTextColor(255, 0, 0); // Red color for the button text
                                                                        doc.text(buttonText, centerX + 10, newYPosition + 10);

                                                                        // Create the clickable link to open the document (e.g., cefData.signature could be a URL to the document)
                                                                        doc.link(centerX, newYPosition + 10, textWidth, 10, { url: cefData.signature });

                                                                        // Update the position after the link
                                                                        newYPosition += lineHeight + 20; // Adjust space for next content
                                                                    }
                                                                } else {
                                                                    // If no signature exists, add a message or alternative content
                                                                    doc.text("No Signature uploaded.", 10, newYPosition + 10);
                                                                    newYPosition += lineHeight + 20; // Adjust space for next content
                                                                }



                                                                (async () => {
                                                                    if (!serviceDataMain.length) return; // If no services, return early

                                                                    // const selectedServices = serviceDataMain.slice(0, 2); // Get only the first 2 services

                                                                    for (let i = 0; i < serviceDataMain.length; i++) {
                                                                        const service = serviceDataMain[i];
                                                                        const tableData = [];

                                                                        if (serviceDataMain.length > 1) {
                                                                            doc.addPage();
                                                                            yPosition = 20;
                                                                        }
                                                                        // Reset yPosition before each service

                                                                        function renderGapMessageNew(gap) {
                                                                            if (!gap) {
                                                                                return 'No Gap'; // Return 'N/A' if gap is undefined or null
                                                                            }
                                                                            const { years, months } = gap; // Safely destructure if gap is valid
                                                                            return `${years} years and ${months} months`;
                                                                        }

                                                                        if (service.db_table === "gap_validation") {


                                                                            doc.setFontSize(12);
                                                                            doc.setTextColor(0, 0, 0);
                                                                            if (annexureData?.gap_validation?.highest_education_gap === 'phd') {


                                                                                // Table for PhD information
                                                                                yPosition += 10;
                                                                                doc.autoTable({
                                                                                    startY: yPosition,
                                                                                    head: [[{ content: 'PHD', colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                    ],
                                                                                    body: [
                                                                                        ['Institute Name', annexureData?.gap_validation?.education_fields?.phd_1?.phd_institute_name_gap || 'N/A'],
                                                                                        ['School Name', annexureData?.gap_validation?.education_fields?.phd_1?.phd_school_name_gap || 'N/A'],
                                                                                        ['Start Date', annexureData?.gap_validation?.education_fields?.phd_1?.phd_start_date_gap || 'N/A'],
                                                                                        ['End Date', annexureData?.gap_validation?.education_fields?.phd_1?.phd_end_date_gap || 'N/A'],
                                                                                        ['Specialization', annexureData?.gap_validation?.education_fields?.phd_1?.phd_specialization_gap || 'N/A'],
                                                                                        ["Gap Status", renderGapMessageNew(gaps?.gapPostGradToPhd) || 'N/A']
                                                                                    ],
                                                                                    theme: 'grid',
                                                                                    margin: { top: 10 },
                                                                                    styles: { fontSize: 10, cellPadding: 3 }
                                                                                });

                                                                                let index = 1;
                                                                                let phdSections = [];

                                                                                while (true) {
                                                                                    const key = `phd_corespondence_${index}`;

                                                                                    // Check if the key exists in annexureData
                                                                                    if (!annexureData?.gap_validation?.education_fields?.[key]) {
                                                                                        break; // Exit loop if the key is missing
                                                                                    }

                                                                                    const phdSection = annexureData.gap_validation.education_fields[key];

                                                                                    // Log the current phdSection to ensure data is being read correctly

                                                                                    phdSections.push([
                                                                                        `Correspondence Phd ${index}`,
                                                                                        phdSection?.phd_institute_name_gap || 'N/A',
                                                                                        phdSection?.phd_school_name_gap || 'N/A',
                                                                                        phdSection?.phd_start_date_gap || 'N/A',
                                                                                        phdSection?.phd_end_date_gap || 'N/A',
                                                                                        phdSection?.phd_specialization_gap || 'N/A'
                                                                                    ]);

                                                                                    index++; // Move to the next phd_corespondence_*
                                                                                }

                                                                                // Check if phdSections is populated before attempting to render

                                                                                if (phdSections.length > 0) {
                                                                                    doc.setFontSize(16);
                                                                                    const textWidth = doc.internal.pageSize.width;
                                                                                    doc.text("Correspondence Phd Details", doc.internal.pageSize.width / 2, doc.autoTable.previous.finalY + 10, {
                                                                                        align: 'center'
                                                                                    });
                                                                                    // Add the table data
                                                                                    doc.autoTable({
                                                                                        head: [['Correspondence', 'Institute Name', 'School Name', 'Start Date', 'End Date', 'Specialization']],
                                                                                        body: phdSections,
                                                                                        startY: doc.autoTable.previous.finalY + 20, // Start below the title
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });
                                                                                } else {
                                                                                }

                                                                            }
                                                                            yPosition = doc.autoTable.previous.finalY + 10;
                                                                            // Post Graduation
                                                                            if (annexureData?.gap_validation?.highest_education_gap === 'post_graduation' || annexureData?.gap_validation?.highest_education_gap === 'phd') {
                                                                                doc.addPage();
                                                                                yPosition = 20;

                                                                                const postGradData = [
                                                                                    ["University / Institute Name", annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_university_institute_name_gap || 'N/A'],
                                                                                    ["Course", annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_course_gap || 'N/A'],
                                                                                    ["Specialization Major", annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_specialization_major_gap || 'N/A'],
                                                                                    ["Start Date", annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_start_date_gap || 'N/A'],
                                                                                    ["End Date", annexureData?.gap_validation?.education_fields?.post_graduation_1?.post_graduation_end_date_gap || 'N/A'],
                                                                                    ["Gap Status", renderGapMessageNew(gaps?.gapGradToPostGrad) || 'N/A']
                                                                                ];


                                                                                doc.autoTable({
                                                                                    head: [[{ content: 'POST GRADUATION', colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                    ],
                                                                                    body: postGradData,
                                                                                    startY: yPosition + 5,
                                                                                    theme: 'grid',
                                                                                    styles: {
                                                                                        cellPadding: 4,
                                                                                        fontSize: 10
                                                                                    }
                                                                                });

                                                                                let index = 1;
                                                                                let postGradSections = [];
                                                                                while (true) {
                                                                                    const key = `post_graduation_corespondence_${index}`;

                                                                                    // Check if the key exists in the annexureData
                                                                                    if (!annexureData?.gap_validation?.education_fields?.[key]) {
                                                                                        break; // Exit loop if the key is missing
                                                                                    }

                                                                                    const postGradSection = annexureData.gap_validation.education_fields[key];

                                                                                    // Push the section data into postGradSections array
                                                                                    postGradSections.push([
                                                                                        `Correspondence Post Graduation ${index}`,
                                                                                        postGradSection?.post_graduation_university_institute_name_gap || 'N/A',
                                                                                        postGradSection?.post_graduation_course_gap || 'N/A',
                                                                                        postGradSection?.post_graduation_specialization_major_gap || 'N/A',
                                                                                        postGradSection?.post_graduation_start_date_gap || 'N/A',
                                                                                        postGradSection?.post_graduation_end_date_gap || 'N/A'
                                                                                    ]);

                                                                                    index++; // Move to the next post_graduation_corespondence_*
                                                                                }

                                                                                // Add a title for the table
                                                                                yPosition += 20;

                                                                                if (postGradSections.length > 0) {
                                                                                    doc.setFontSize(16);
                                                                                    doc.text("Correspondence Post Graduation Details", doc.internal.pageSize.width / 2, doc.autoTable.previous.finalY + 10, {
                                                                                        align: 'center'
                                                                                    });

                                                                                    doc.autoTable({
                                                                                        head: [['Correspondence', 'University/Institute Name', 'Course', 'Specialization Major', 'Start Date', 'End Date']],
                                                                                        body: postGradSections,
                                                                                        startY: doc.autoTable.previous.finalY + 20, // Start below the title
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });
                                                                                }

                                                                            }

                                                                            // Graduation
                                                                            yPosition = yPosition += 30;
                                                                            if (annexureData?.gap_validation?.highest_education_gap === 'graduation' || annexureData?.gap_validation?.highest_education_gap === 'post_graduation' || annexureData?.gap_validation?.highest_education_gap === 'phd') {


                                                                                const gradData = [
                                                                                    ["University / Institute Name", annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_university_institute_name_gap || 'N/A'],
                                                                                    ["Course", annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_course_gap || 'N/A'],
                                                                                    ["Specialization Major", annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_specialization_major_gap || 'N/A'],
                                                                                    ["Start Date", annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_start_date_gap || 'N/A'],
                                                                                    ["End Date", annexureData?.gap_validation?.education_fields?.graduation_1?.graduation_end_date_gap || 'N/A'],
                                                                                    ["Gap Status", renderGapMessageNew(gaps?.gapSrSecToGrad) || 'N/A']

                                                                                ];

                                                                                doc.autoTable({
                                                                                    head: [[{ content: 'GRADUATION', colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                    ],
                                                                                    body: gradData,
                                                                                    startY: doc.autoTable.previous.finalY + 10,
                                                                                    theme: 'grid',
                                                                                    styles: {
                                                                                        cellPadding: 4,
                                                                                        fontSize: 10
                                                                                    }
                                                                                });

                                                                                let index = 1;
                                                                                let Graduation = [];
                                                                                while (true) {
                                                                                    const key = `graduation_corespondence_${index}`;

                                                                                    // Check if the key exists in the annexureData
                                                                                    if (!annexureData?.gap_validation?.education_fields?.[key]) {
                                                                                        break; // Exit loop if the key is missing
                                                                                    }

                                                                                    const GradSec = annexureData.gap_validation.education_fields[key];

                                                                                    // Push the section data into Graduation array
                                                                                    Graduation.push([
                                                                                        `Correspondence Graduation ${index}`,
                                                                                        GradSec?.graduation_university_institute_name_gap || 'N/A',
                                                                                        GradSec?.graduation_course_gap || 'N/A',
                                                                                        GradSec?.graduation_specialization_major_gap || 'N/A',
                                                                                        GradSec?.graduation_start_date_gap || 'N/A',
                                                                                        GradSec?.graduation_end_date_gap || 'N/A'
                                                                                    ]);

                                                                                    index++; // Move to the next post_graduation_corespondence_*
                                                                                }

                                                                                if (Graduation.length > 0) {
                                                                                    // Add a title for the table
                                                                                    doc.setFontSize(16);
                                                                                    doc.text("Correspondence Graduation Details", doc.internal.pageSize.width / 2, doc.autoTable.previous.finalY + 10, {
                                                                                        align: 'center'
                                                                                    });
                                                                                    // Add the table data
                                                                                    doc.autoTable({
                                                                                        head: [['Correspondence', 'University/Institute Name', 'Course', 'Specialization Major', 'Start Date', 'End Date']],
                                                                                        body: Graduation,
                                                                                        startY: doc.autoTable.previous.finalY + 30, // Start below the title
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });

                                                                                }

                                                                                // Call this function separately if required for gap message
                                                                            }

                                                                            if (annexureData?.gap_validation?.highest_education_gap === 'senior_secondary' || annexureData?.gap_validation?.highest_education_gap === 'graduation' || annexureData?.gap_validation?.highest_education_gap === 'phd' || annexureData?.gap_validation?.highest_education_gap === 'post_graduation') {

                                                                                const seniorSecondaryData = [
                                                                                    ["School Name", annexureData?.gap_validation?.education_fields?.senior_secondary?.senior_secondary_school_name_gap || 'N/A'],
                                                                                    ["Start Date", annexureData?.gap_validation?.education_fields?.senior_secondary?.senior_secondary_start_date_gap || 'N/A'],
                                                                                    ["End Date", annexureData?.gap_validation?.education_fields?.senior_secondary?.senior_secondary_end_date_gap || 'N/A'],
                                                                                    ["Gap Status", renderGapMessageNew(gaps?.gapSecToSrSec) || 'N/A']
                                                                                ];

                                                                                doc.autoTable({
                                                                                    head: [[{ content: 'SENIOR SECONDARY', colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                    ],
                                                                                    body: seniorSecondaryData,
                                                                                    startY: doc.autoTable.previous.finalY + 30,
                                                                                    theme: 'grid',
                                                                                    styles: {
                                                                                        cellPadding: 4,
                                                                                        fontSize: 10
                                                                                    }
                                                                                });

                                                                                let index = 1;
                                                                                let seniorSecondarySections = [];

                                                                                while (true) {
                                                                                    const key = `senior_secondary_corespondence_${index}`;

                                                                                    // Check if the key exists in annexureData
                                                                                    if (!annexureData?.gap_validation?.education_fields?.[key]) {
                                                                                        break; // Exit loop if the key is missing
                                                                                    }

                                                                                    const seniorSecondarySection = annexureData.gap_validation.education_fields[key];

                                                                                    // Push the section data into seniorSecondarySections array
                                                                                    seniorSecondarySections.push([
                                                                                        `Correspondence SENIOR SECONDARY ${index}`,
                                                                                        seniorSecondarySection?.senior_secondary_school_name_gap || 'N/A',
                                                                                        seniorSecondarySection?.senior_secondary_start_date_gap || 'N/A',
                                                                                        seniorSecondarySection?.senior_secondary_end_date_gap || 'N/A'
                                                                                    ]);

                                                                                    index++; // Move to the next senior_secondary_corespondence_*
                                                                                }

                                                                                // Add a title for the table
                                                                                if (seniorSecondarySections.length > 0) {
                                                                                    doc.setFontSize(16);
                                                                                    doc.text("Correspondence Senior Secondary Details", doc.internal.pageSize.width / 2, doc.autoTable.previous.finalY + 10, {
                                                                                        align: 'center'
                                                                                    });
                                                                                    // Add the table data
                                                                                    doc.autoTable({
                                                                                        head: [['Correspondence', 'School Name', 'Start Date', 'End Date']],
                                                                                        body: seniorSecondarySections,
                                                                                        startY: doc.autoTable.previous.finalY + 20, // Start below the title
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });

                                                                                }

                                                                                ;  // Call this function separately if required for gap message
                                                                            }

                                                                            doc.addPage();
                                                                            yPosition = 10;
                                                                            // Secondary Education Section
                                                                            if (
                                                                                annexureData["gap_validation"].highest_education_gap === 'secondary' ||
                                                                                annexureData["gap_validation"].highest_education_gap === 'senior_secondary' ||
                                                                                annexureData["gap_validation"].highest_education_gap === 'graduation' ||
                                                                                annexureData["gap_validation"].highest_education_gap === 'phd' ||
                                                                                annexureData["gap_validation"].highest_education_gap === 'post_graduation'
                                                                            ) {

                                                                                const secondaryData = [
                                                                                    ["School Name", annexureData?.gap_validation?.education_fields?.secondary?.secondary_school_name_gap || 'N/A'],
                                                                                    ["Start Date", annexureData?.gap_validation?.education_fields?.secondary?.secondary_start_date_gap || 'N/A'],
                                                                                    ["End Date", annexureData?.gap_validation?.education_fields?.secondary?.secondary_end_date_gap || 'N/A']
                                                                                ];

                                                                                // Generate the table for secondary education
                                                                                doc.autoTable({
                                                                                    head: [[{ content: 'SECONDARY', colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                    ],
                                                                                    body: secondaryData,
                                                                                    startY: yPosition,
                                                                                    theme: 'grid',
                                                                                    styles: {
                                                                                        cellPadding: 4,
                                                                                        fontSize: 10
                                                                                    }
                                                                                });

                                                                                let index = 1;
                                                                                let SecondarySections = [];

                                                                                // Loop through to find any "secondary_corespondence_*" sections and add them
                                                                                while (true) {
                                                                                    const key = `secondary_corespondence_${index}`;

                                                                                    // Check if the key exists in annexureData
                                                                                    if (!annexureData?.gap_validation?.education_fields?.[key]) {
                                                                                        break; // Exit loop if the key is missing
                                                                                    }

                                                                                    const secondarySection = annexureData.gap_validation.education_fields[key];

                                                                                    // Push the section data into SecondarySections array
                                                                                    SecondarySections.push([
                                                                                        `Correspondence SECONDARY ${index}`,
                                                                                        secondarySection?.secondary_school_name_gap || 'N/A',
                                                                                        secondarySection?.secondary_start_date_gap || 'N/A',
                                                                                        secondarySection?.secondary_end_date_gap || 'N/A'
                                                                                    ]);

                                                                                    index++; // Move to the next secondary_corespondence_*
                                                                                }

                                                                                // Add a title for the table if there are any secondary sections
                                                                                if (SecondarySections.length > 0) {
                                                                                    doc.setFontSize(16);
                                                                                    doc.text("Correspondence Secondary Education Details", doc.internal.pageSize.width / 2, doc.autoTable.previous.finalY + 10, {
                                                                                        align: 'center'
                                                                                    });
                                                                                    // Add the table data
                                                                                    doc.autoTable({
                                                                                        head: [['Secondary No.', 'School Name', 'Start Date', 'End Date']],
                                                                                        body: SecondarySections,
                                                                                        startY: doc.autoTable.previous.finalY + 20, // Start below the title
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });


                                                                                }
                                                                            }


                                                                            yPosition = doc.autoTable.previous.finalY + 10;

                                                                            // Employment Section
                                                                            doc.setFontSize(18);
                                                                            const employmentData = [
                                                                                ["Years of Experience", annexureData["gap_validation"].years_of_experience_gap || ''],
                                                                                ["No of Employment", annexureData["gap_validation"].no_of_employment || '']
                                                                            ];

                                                                            doc.autoTable({
                                                                                head: [[{ content: `Employment Deails`, colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                ],
                                                                                body: employmentData,
                                                                                startY: doc.autoTable.previous.finalY + 10,
                                                                                theme: 'grid',
                                                                                styles: {
                                                                                    cellPadding: 4,
                                                                                    fontSize: 10
                                                                                }
                                                                            });

                                                                            doc.setFontSize(12);
                                                                            // Dynamically render Employment Forms
                                                                            if (annexureData["gap_validation"].no_of_employment > 0) {
                                                                                let yPosition = doc.autoTable.previous.finalY + 10;

                                                                                Array.from({ length: annexureData["gap_validation"].no_of_employment || 0 }, (_, index) => {
                                                                                    const employmentFormData = [
                                                                                        ["Employment Type", annexureData["gap_validation"]?.employment_fields?.[`employment_${index + 1}`]?.[`employment_type_gap`] || ''],
                                                                                        ["Start Date", annexureData["gap_validation"]?.employment_fields?.[`employment_${index + 1}`]?.[`employment_start_date_gap`] || ''],
                                                                                        ["End Date", annexureData["gap_validation"]?.employment_fields?.[`employment_${index + 1}`]?.[`employment_end_date_gap`] || '']
                                                                                    ];

                                                                                    doc.autoTable({
                                                                                        head: [[{ content: `Employment (${index + 1})`, colSpan: 2, styles: { halign: 'center', fontSize: 12, bold: true } }],
                                                                                        ],
                                                                                        body: employmentFormData,
                                                                                        startY: yPosition,
                                                                                        theme: 'grid',
                                                                                        styles: {
                                                                                            cellPadding: 4,
                                                                                            fontSize: 10
                                                                                        }
                                                                                    });

                                                                                    yPosition = doc.autoTable.previous.finalY + 10;
                                                                                    for (let idx = 0; idx < employGaps.length; idx++) {
                                                                                        const item = employGaps[idx];  // Fix: Use idx directly, not idx - 1


                                                                                        if (item) {
                                                                                            const isNoGap = item.difference.toLowerCase().includes("no") && item.difference.toLowerCase().includes("gap");

                                                                                            const isMatchingEndDate = item.endValue === annexureData["gap_validation"]?.employment_fields?.[`employment_${index}`]?.[`employment_end_date_gap`];

                                                                                            if (isMatchingEndDate) {
                                                                                                // Prepare the text to be shown in the document
                                                                                                const textToDisplay = `${isNoGap ? item.difference : `GAP:${item.difference || 'No gap Found'}`}`;

                                                                                                // Log the text that will be displayed

                                                                                                // Display the text in the document
                                                                                                doc.text(
                                                                                                    textToDisplay,
                                                                                                    14,
                                                                                                    doc.autoTable.previous.finalY + 7
                                                                                                );

                                                                                                // Update yPosition for next table or text
                                                                                                yPosition = doc.autoTable.previous.finalY + 10;

                                                                                            }
                                                                                        }
                                                                                    }


                                                                                });
                                                                            }



                                                                        }
                                                                        else {
                                                                            service.rows.forEach((row, rowIndex) => {

                                                                                if (hiddenRows[`${i}-${rowIndex}`]) {
                                                                                    return null;
                                                                                }
                                                                                row.inputs.forEach((input) => {
                                                                                    const isCheckbox = input.type === 'checkbox';
                                                                                    const isDoneCheckbox = isCheckbox && (input.name.startsWith('done_or_not') || input.name.startsWith('has_not_done'));
                                                                                    const isChecked = ["1", 1, true, "true"].includes(annexureData[service.db_table]?.[input.name] ?? false);

                                                                                    // Handle logic for checkbox checked state
                                                                                    if (isDoneCheckbox && isChecked) {
                                                                                        // Hide all rows except the one with the checked checkbox
                                                                                        service.rows.forEach((otherRow, otherRowIndex) => {
                                                                                            if (otherRowIndex !== rowIndex) {
                                                                                                hiddenRows[`${i}-${otherRowIndex}`] = true; // Hide other rows
                                                                                            }
                                                                                        });
                                                                                        hiddenRows[`${i}-${rowIndex}`] = false; // Ensure current row stays visible
                                                                                    }
                                                                                    if (input.type === 'file') return; // Skip file inputs

                                                                                    const inputValue = annexureData[service.db_table]?.[input.name] || "NIL";
                                                                                    tableData.push([input.label, inputValue]);
                                                                                });
                                                                            });

                                                                            // Add service heading
                                                                            doc.setFontSize(16);
                                                                            yPosition += 10;
                                                                            doc.autoTable({
                                                                                startY: yPosition,
                                                                                head: [[{ content: service.heading, colSpan: 2, styles: { halign: 'center', fontSize: 16, bold: true } }],
                                                                                ],
                                                                                body: tableData,
                                                                                theme: 'grid',
                                                                                margin: { horizontal: 10 },
                                                                                styles: { fontSize: 10 },
                                                                            });

                                                                            yPosition = doc.lastAutoTable.finalY + 10; // Update yPosition after table


                                                                            // Process and add images for this service
                                                                            const fileInputs = service.rows.flatMap(row =>
                                                                                row.inputs.filter(({ type }) => type === "file").map(input => input.name)
                                                                            );

                                                                            if (fileInputs.length > 0) {
                                                                                const filePromises = fileInputs.map(async (inputName) => {
                                                                                    const annexureFilesStr = annexureData[service.db_table]?.[inputName];
                                                                                    let annexureDataImageHeight = 220;

                                                                                    if (annexureFilesStr) {
                                                                                        const fileUrls = annexureFilesStr.split(",").map(url => url.trim());
                                                                                        if (fileUrls.length === 0) {
                                                                                            doc.setFont("helvetica", "italic");
                                                                                            doc.setFontSize(10);
                                                                                            doc.setTextColor(150, 150, 150);
                                                                                            doc.text("No annexure files available.", 10, yPosition + 10);
                                                                                            yPosition += 10;
                                                                                            return;
                                                                                        }

                                                                                        // Filter out non-image URLs (pdf, xls, etc.)
                                                                                        const imageUrlsToProcess = fileUrls.filter(url => {
                                                                                            const validImageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
                                                                                            return validImageExtensions.some(ext => url.toLowerCase().endsWith(ext));
                                                                                        });

                                                                                        // Filter out URLs that are not images
                                                                                        const nonImageUrlsToProcess = fileUrls.filter(url => {
                                                                                            const validNonImageExtensions = ['pdf', 'xls', 'xlsx'];
                                                                                            return validNonImageExtensions.some(ext => url.toLowerCase().endsWith(ext));
                                                                                        });

                                                                                        // Handle image files
                                                                                        if (imageUrlsToProcess.length > 0) {
                                                                                            const imageBases = await fetchImageToBase(imageUrlsToProcess);
                                                                                            for (const image of imageBases) {
                                                                                                if (!image.base64.startsWith('data:image/')) continue;

                                                                                                doc.addPage();
                                                                                                yPosition = 20;

                                                                                                try {
                                                                                                    const imageWidth = doc.internal.pageSize.width - 10;
                                                                                                    // Adjust height if needed based on image dimensions or conditions
                                                                                                    doc.addImage(image.base64, image.type, 5, yPosition + 20, imageWidth, annexureDataImageHeight);
                                                                                                    yPosition += (annexureDataImageHeight + 30);
                                                                                                } catch (error) {
                                                                                                    console.error(`Error adding image:`, error);
                                                                                                }
                                                                                            }
                                                                                        }

                                                                                        // Handle non-image files (PDF, XLS, etc.)
                                                                                        const pageHeight = doc.internal.pageSize.height;
                                                                                        const margin = 10; // margin from top and bottom
                                                                                        let lineHeight = 10; // space between lines

                                                                                        if (nonImageUrlsToProcess.length > 0) {
                                                                                            nonImageUrlsToProcess.forEach(url => {
                                                                                                // Calculate available space on the current page
                                                                                                if (yPosition + lineHeight > pageHeight - margin) {
                                                                                                    doc.addPage(); // Add a new page if there's not enough space
                                                                                                    yPosition = margin; // Reset yPosition after adding a new page
                                                                                                }

                                                                                                // Add a button to open the file in a new tab
                                                                                                doc.setFont("helvetica", "normal");
                                                                                                doc.setFontSize(10);
                                                                                                doc.setTextColor(255, 0, 0);
                                                                                                const buttonText = `Click to open the file`;
                                                                                                const textWidth = doc.getTextWidth(buttonText);
                                                                                                const centerX = (doc.internal.pageSize.width - textWidth) / 2;

                                                                                                // Add the text at the center and create the link
                                                                                                doc.text(buttonText, centerX, yPosition + 10);
                                                                                                doc.link(centerX, yPosition + 10, textWidth, 10, { url: url });

                                                                                                // Adjust yPosition for the next line
                                                                                                yPosition += lineHeight + 2; // Adjust for button space
                                                                                            });
                                                                                        }

                                                                                    }
                                                                                });

                                                                                await Promise.all(filePromises);
                                                                            }


                                                                        }

                                                                    }
                                                                    doc.save(`${customerInfo?.client_unique_id}-${customerInfo?.name}`);

                                                                    swalLoading.close();

                                                                    // Optionally, show a success message
                                                                    Swal.fire({
                                                                        title: 'PDF Generated!',
                                                                        text: 'Your PDF has been successfully generated.',
                                                                        icon: 'success',
                                                                        confirmButtonText: 'OK'
                                                                    });
                                                                })();


                                                            } catch (error) {
                                                                console.error("PDF generation error:", error);
                                                                reject(new Error("Error generating PDF"));
                                                            }
                                                        }
                                                    );
                                                }
                                            );
                                        });
                                    });
                                }
                            );
                        }
                    );
                }
            );
        });
    },
};
