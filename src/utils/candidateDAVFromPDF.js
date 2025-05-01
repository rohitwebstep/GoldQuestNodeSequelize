const CandidateMasterTrackerModel = require("../models/admin/candidateMasterTrackerModel");
const Admin = require("../models/admin/adminModel");
const Branch = require("../models/customer/branch/branchModel");
const DAV = require("../models/customer/branch/davModel");
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

function calculateDateDifference(date1, date2) {
    const d1 = new Date(date1);
    const d2 = new Date(date2);

    if (isNaN(d1) || isNaN(d2)) return "Invalid Date";

    // Check if date1 is greater than or equal to date2
    if (d1 >= d2) return "No gap";

    let years = d2.getFullYear() - d1.getFullYear();
    let months = d2.getMonth() - d1.getMonth();
    let days = d2.getDate() - d1.getDate();

    if (days < 0) {
        months--;
        days += new Date(d2.getFullYear(), d2.getMonth(), 0).getDate();
    }
    if (months < 0) {
        years--;
        months += 12;
    }

    return `${years > 0 ? years + " year(s) " : ""}${months > 0 ? months + " month(s) " : ""}${days > 0 ? days + " day(s)" : ""}`.trim();
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
    return { employGaps: employmentGaps, gaps: nonNegativeGaps };
}

function createEmploymentFields(noOfEmployments, fieldValue) {
    let employmentFieldsData = fieldValue.employment_fields;

    // Check if it's a string (i.e., it's been stringified previously) and parse it
    if (typeof employmentFieldsData === 'string') {
        employmentFieldsData = JSON.parse(employmentFieldsData);
    }

    const employmentFields = {}; // Initialize the employmentFields object to store all employment data

    // Dynamically structure the data like: employment_1, employment_2, etc.
    for (let i = 1; i <= noOfEmployments; i++) {
        const employmentData = employmentFieldsData[`employment_${i}`] || {};

        employmentFields[`employment_${i}`] = {
            employment_type_gap: employmentData.employment_type_gap || '',
            employment_start_date_gap: employmentData.employment_start_date_gap || '',
            employment_end_date_gap: employmentData.employment_end_date_gap || '',
        };
    }

    return employmentFields;
}


const formatDate = (isoString) => {
    const date = new Date(isoString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
};
module.exports = {
    candidateDAVFromPDF: async (
        candidate_applicaton_id,
        branch_id,
        customer_id,
        pdfFileName,
        targetDirectory
    ) => {
        return new Promise((resolve, reject) => {
            // console.log(`DEBUG: Calling applicationListByBranchByCandidateID for ID: ${candidate_applicaton_id}`);

            CandidateMasterTrackerModel.applicationListByBranchByCandidateID(
                candidate_applicaton_id,
                branch_id,
                async (err, application) => {
                    if (err) {
                        // console.error("Database error:", err);
                        return reject(new Error(`Database error: ${err.message}`));
                    }

                    if (!application) {
                        // console.warn("Application not found");
                        return reject(new Error("Application not found"));
                    }

                    // console.log(`application - `, application);

                    // console.log(`Step 1: Application data fetched for ID: ${candidate_applicaton_id}`);

                    CandidateMasterTrackerModel.applicationByID(
                        candidate_applicaton_id,
                        branch_id,
                        (err, currentApplication) => {
                            if (err) {
                                reject(
                                    new Error(err.message)
                                );
                            }

                            if (!currentApplication) {
                                reject(
                                    new Error("Application not found")
                                );
                            }

                            CandidateMasterTrackerModel.davApplicationByID(
                                candidate_applicaton_id,
                                branch_id,
                                (err, DAVApplicationData) => {
                                    if (err) {
                                        // console.error("Database error:", err);
                                        reject(
                                            new Error(err.message)
                                        );
                                    }

                                    const davData = DAVApplicationData;

                                    Branch.getBranchById(branch_id, (err, currentBranch) => {
                                        if (err) {
                                            // console.error("Database error during branch retrieval:", err);
                                            reject(
                                                new Error('Failed to retrieve Branch. Please try again.')
                                            );
                                        }

                                        if (!currentBranch) {
                                            reject(
                                                new Error('Branch not found.')
                                            );
                                        }

                                        Customer.getCustomerById(
                                            parseInt(currentBranch.customer_id),
                                            (err, currentCustomer) => {
                                                if (err) {
                                                    /*
                                                    // console.error(
                                                        "Database error during customer retrieval:",
                                                        err
                                                    );
                                                    */
                                                    reject(
                                                        new Error('Failed to retrieve Customer. Please try again.')
                                                    );
                                                }

                                                if (!currentCustomer) {
                                                    reject(
                                                        new Error('Customer not found.')
                                                    );
                                                }

                                                const companyName = currentCustomer.name;

                                                try {
                                                    // Create a new PDF document
                                                    const doc = new jsPDF();
                                                    let yPosition = 10;
                                                    const gapY = 8; // consistent gap between tables

                                                    // Table 1: Header
                                                    doc.autoTable({
                                                        startY: yPosition,
                                                        head: [[{
                                                            content: 'Digital Address Verification Form',
                                                            styles: {
                                                                halign: 'center',
                                                                fontSize: 12,
                                                                fontStyle: 'bold',
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80]
                                                            }
                                                        }]],
                                                        body: [[{
                                                            content: `Company name: ${companyName}`,
                                                            styles: { fontStyle: 'bold', halign: 'center' }
                                                        }]],
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            cellPadding: 2,
                                                            fontSize: 10,
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0]
                                                        }
                                                    });
                                                    yPosition = doc.autoTable.previous.finalY + gapY;
                                                    const pageWidth = doc.internal.pageSize.getWidth() - 30;

                                                    console.log('davData', davData);
                                                    const personalBody = [
                                                        [{ content: "Full Name of the Applicant", styles: { fontStyle: 'bold' } }, davData?.name || "N/A"],
                                                        [{ content: "Aadhaar Number", styles: { fontStyle: 'bold' } }, davData?.aadhaar_number || "N/A"],
                                                        [{ content: "Father's Name", styles: { fontStyle: 'bold' } }, davData?.father_name || "N/A"],
                                                        [{ content: "Email Id", styles: { fontStyle: 'bold' } }, davData?.email || "N/A"],
                                                        [{ content: "Employee ID", styles: { fontStyle: 'bold' } }, davData?.employee_id || "N/A"],
                                                        [{ content: "Mobile Number", styles: { fontStyle: 'bold' } }, davData?.mobile_number || "N/A"],
                                                        [{ content: "Gender", styles: { fontStyle: 'bold' } }, davData?.gender || "N/A"],
                                                        [{ content: "Marital Status", styles: { fontStyle: 'bold' } }, davData?.marital_status || "N/A"],
                                                        [{ content: "Date of Birth (dd/mm/yy)", styles: { fontStyle: 'bold' } }, davData?.dob || "N/A"],
                                                        [{ content: "Husband's Name", styles: { fontStyle: 'bold' } }, davData?.husband_name || "N/A"],
                                                        [{ content: "Latitude", styles: { fontStyle: 'bold' } }, davData?.latitude || "N/A"],
                                                        [{ content: "Longitude", styles: { fontStyle: 'bold' } }, davData?.longitude || "N/A"],
                                                        [{ content: "Type of ID Attached", styles: { fontStyle: 'bold' } }, davData?.id_type || "N/A"],
                                                        [{ content: "No of years staying in the address", styles: { fontStyle: 'bold' } }, davData?.years_staying || "N/A"],

                                                    ];

                                                    doc.autoTable({
                                                        startY: yPosition,
                                                        head: [[{
                                                            content: "Personal Information",
                                                            colSpan: 2,
                                                            styles: {
                                                                halign: "center",
                                                                fontSize: 12,
                                                                fontStyle: "bold",
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80],
                                                                cellPadding: 2
                                                            }
                                                        }]],
                                                        body: personalBody,
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            fontSize: 10,
                                                            font: 'helvetica',
                                                            textColor: [80, 80, 80],
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0],
                                                            cellPadding: 2
                                                        },
                                                        headStyles: {
                                                            fillColor: [197, 217, 241],
                                                            textColor: [0, 0, 0],
                                                            fontStyle: 'bold',
                                                            fontSize: 11
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: pageWidth * 0.4 },
                                                            1: { cellWidth: pageWidth * 0.6 }
                                                        }
                                                    });
                                                    yPosition = doc.autoTable.previous.finalY + gapY;

                                                    // Table 3: Current Address
                                                    doc.autoTable({
                                                        startY: yPosition,
                                                        head: [[{
                                                            content: 'Current Address',
                                                            colSpan: 2,
                                                            styles: {
                                                                halign: 'center',
                                                                fontSize: 12,
                                                                fontStyle: 'bold',
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80]
                                                            }
                                                        }]],
                                                        body: [
                                                            [
                                                                { content: 'Current Address', styles: { fontStyle: 'bold' } },
                                                                davData.candidate_address || 'N/A'
                                                            ],
                                                            [
                                                                { content: 'Pin Code', styles: { fontStyle: 'bold' } },
                                                                davData.pin_code || 'N/A'
                                                            ],

                                                            [
                                                                { content: 'Current State', styles: { fontStyle: 'bold' } },
                                                                davData.state || 'N/A'
                                                            ],
                                                            [
                                                                { content: 'Current Landmark', styles: { fontStyle: 'bold' } },
                                                                davData.landmark || 'N/A'
                                                            ],
                                                            [
                                                                { content: 'Period of Stay', styles: { fontStyle: 'bold' } },
                                                                `${davData.from_date} to ${davData.to_date || 'N/A'}`

                                                            ],
                                                            [
                                                                { content: 'Nearest Police Station', styles: { fontStyle: 'bold' } },
                                                                davData.police_station || 'N/A'
                                                            ]
                                                        ],
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            fontSize: 10,
                                                            cellPadding: 2,
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0]
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: pageWidth * 0.4 },
                                                            1: { cellWidth: pageWidth * 0.6 }
                                                        }
                                                    });


                                                    yPosition = doc.autoTable.previous.finalY - 2;
                                                    (async () => {
                                                        let newYPosition = 20
                                                        const backgroundColor = '#c5d9f1';

                                                        doc.setDrawColor(0, 0, 0); // Set border color to black
                                                        doc.setFillColor(backgroundColor);
                                                        doc.setTextColor(80, 80, 80); // Black text
                                                        doc.setFontSize(13);

                                                        doc.setFont('helvetica', 'bold'); // Set font to Helvetica Bold

                                                        doc.setFont('helvetica', 'normal'); // Reset to normal for following text

                                                        newYPosition = doc.autoTable.previous.finalY - 70; // Adjusting for space from the last table

                                                        // Save PDF
                                                        console.log(`pdfFileName - `, pdfFileName);
                                                        // doc.save(`123.pdf`);

                                                        // console.log(`targetDirectory - `, targetDirectory);
                                                        const pdfPathCloud = await savePdf(
                                                            doc,
                                                            pdfFileName,
                                                            targetDirectory
                                                        );
                                                        resolve(pdfPathCloud);
                                                        // console.log("PDF generation completed successfully.");
                                                    })();
                                                } catch (error) {
                                                    // console.error("PDF generation error:", error);
                                                    reject(new Error("Error generating PDF"));
                                                }
                                            }
                                        );
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