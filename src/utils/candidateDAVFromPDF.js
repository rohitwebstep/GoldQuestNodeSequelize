const CandidateMasterTrackerModel = require("../models/admin/candidateMasterTrackerModel");
const Admin = require("../models/admin/adminModel");
const Branch = require("../models/customer/branch/branchModel");
const DAV = require("../models/customer/branch/davModel");
const Customer = require("../models/customer/customerModel");
const AppModel = require("../models/appModel");
const polyline = require('@mapbox/polyline');
const { createCanvas, loadImage } = require('canvas');
const { jsPDF } = require("jspdf");
require("jspdf-autotable");
const fs = require("fs");
const path = require("path");
const LogoImg = path.join(__dirname, '../../Images/Logo.png');
const axios = require("axios");
const sharp = require("sharp");
const {
    upload,
    saveImage,
    saveImages,
    savePdf,
} = require("../utils/cloudImageSave");

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

function scaleImage(img, maxWidth, maxHeight) {
    const imgWidth = img.width;
    const imgHeight = img.height;

    let width = imgWidth;
    let height = imgHeight;

    // Scale image to fit within maxWidth and maxHeight
    if (imgWidth > maxWidth) {
        width = maxWidth;
        height = (imgHeight * maxWidth) / imgWidth;
    }

    if (height > maxHeight) {
        height = maxHeight;
        width = (imgWidth * maxHeight) / imgHeight;
    }

    return { width, height };
}

async function checkImageExists(url) {
    try {
        const response = await fetch(url, { method: "HEAD" });
        return response.ok; // Returns true if HTTP status is 200-299
    } catch (error) {
        console.error(`Error checking image existence at ${url}:`, error);
        return false;
    }
}

async function validateImage(url) {
    try {
        const response = await axios.get(url, { responseType: "arraybuffer" });
        if (response.status !== 200) {
            console.warn(
                `Image fetch failed for URL: ${url} with status: ${response.status}`
            );
            return null;
        }

        if (!response.data) {
            console.warn(`No data found in the response for URL: ${url}`);
            return null;
        }

        const buffer = Buffer.from(response.data);
        const metadata = await sharp(buffer).metadata();

        if (!metadata) {
            console.warn(`Unable to fetch metadata for image from URL: ${url}`);
            return null;
        }

        return {
            src: url,
            width: metadata.width,
            height: metadata.height,
            format: metadata.format,
        };
    } catch (error) {
        console.error(`Error validating image from ${url}:`, error);
        return null;
    }
}

const getImageFormat = (url) => {
    const ext = url.split(".").pop().toLowerCase();
    if (ext === "png") return "PNG";
    if (ext === "jpg" || ext === "jpeg") return "JPEG";
    if (ext === "webp") return "WEBP";
    return "PNG"; // Default to PNG if not recognized
};

async function fetchImageAsBase64(imageUrl) {
    try {
        const response = await axios.get(imageUrl, { responseType: "arraybuffer" });
        return `data:image/png;base64,${Buffer.from(
            response.data,
            "binary"
        ).toString("base64")}`;
    } catch (error) {
        console.error("Error fetching or converting image:", error.message);
        // throw new Error("Failed to fetch image");
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

// Step 2: Convert address to lat/lng using Geocoding API
async function getCoordinatesFromAddress(address) {
    try {
        console.log('📍 Original address input:', address);

        const encoded = encodeURIComponent(address);
        console.log('🔐 Encoded address:', encoded);

        const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${GOOGLE_API_KEY}`;
        console.log('🌐 Geocoding API URL:', url);

        const response = await axios.get(url);
        console.log('📦 Raw geocoding response:', JSON.stringify(response.data, null, 2));

        if (response.data.status === 'OK') {
            const location = response.data.results[0].geometry.location;
            console.log('✅ Extracted Coordinates:', location);
            return location;
        } else {
            console.error('⚠️ Geocoding failed with status:', response.data.status);
            return null;
        }
    } catch (error) {
        console.error('❌ Error while fetching geocode:', error.message);
        return null;
    }
}
async function fetchImageToBase(imageUrls) {
    try {
        // console.log("🔄 Starting fetchImageToBase function...");
        const urls = Array.isArray(imageUrls) ? imageUrls : [imageUrls];
        // console.log("✅ Image URLs received:", urls);

        const results = [];

        for (const imageUrl of urls) {
            // console.log("🔍 Processing image:", imageUrl);

            if (imageUrl.startsWith("http") || imageUrl.startsWith("https")) {
                // console.log("🌐 Detected as a URL, checking if image exists...");

                if (!(await checkImageExists(imageUrl))) {
                    // console.warn(`⚠️ Image does not exist: ${imageUrl}`);
                    continue;
                }

                // console.log("✅ Image exists, validating...");
                const imgData = await validateImage(imageUrl);

                if (!imgData) {
                    // console.warn(`⚠️ Validation failed for image: ${imageUrl}`);
                    continue;
                }

                // console.log("✅ Image validated successfully, processing Base64 conversion...");
                results.push({
                    imageUrl: imgData.src,
                    base64: `data:image/${imgData.format};base64,${imgData.buffer.toString("base64")}`,
                    type: imgData.format,
                    width: imgData.width,
                    height: imgData.height,
                });

                // console.log("🎉 Image processed successfully:", imgData.src);
            } else {
                // console.log("📂 Detected as a local file, normalizing path...");
                const normalizedPath = path.resolve(imageUrl.replace(/\\/g, "/"));
                // console.log("📝 Normalized Path:", normalizedPath);

                if (fs.existsSync(normalizedPath)) {
                    // console.log("✅ File exists, reading...");
                    const imageBuffer = fs.readFileSync(normalizedPath);
                    // console.log("✅ Successfully read file, converting to Base64...");
                    return `data:image/png;base64,${imageBuffer.toString("base64")}`;
                } else {
                    // console.error(`❌ Error: Local file not found -> ${normalizedPath}`);
                    return null;
                }
            }
        }

        // console.log("🏁 Processing complete. Returning results...");
        return results.length > 0 ? results : null;
    } catch (error) {
        // console.error(`❌ Error fetching images as Base64:`, error.message);
        return null;
    }
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

function generateCirclePoints(lat, lng, radiusInMeters, numPoints = 32) {
    const earthRadius = 6378137;
    const d = radiusInMeters / earthRadius;
    const centerLat = (lat * Math.PI) / 180;
    const centerLng = (lng * Math.PI) / 180;

    const points = [];

    for (let i = 0; i <= numPoints; i++) {
        const angle = (2 * Math.PI * i) / numPoints;
        const latRad = Math.asin(Math.sin(centerLat) * Math.cos(d) +
            Math.cos(centerLat) * Math.sin(d) * Math.cos(angle));
        const lngRad = centerLng + Math.atan2(
            Math.sin(angle) * Math.sin(d) * Math.cos(centerLat),
            Math.cos(d) - Math.sin(centerLat) * Math.sin(latRad)
        );

        points.push([
            (latRad * 180) / Math.PI,
            (lngRad * 180) / Math.PI
        ]);
    }

    return polyline.encode(points);
}

function haversineDistance(lat1, lng1, lat2, lng2) {
    const toRad = deg => (deg * Math.PI) / 180;
    const R = 6371000; // Earth's radius in meters

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of Earth in kilometers
    const toRad = angle => (angle * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return (R * c).toFixed(2); // distance in km
}
function fixUrl(url) {
    return url.replace(/\\/g, '/');
}

async function toBase64FromUrl(url) {
    try {
        const image = await loadImage(fixUrl(url));
        const canvas = createCanvas(image.width, image.height);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        return canvas.toDataURL('image/jpeg'); // or 'image/png'
    } catch (error) {
        throw new Error('Failed to load or convert image: ' + url);
    }
}


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

                                    console.log(`DAVApplicationData - `, DAVApplicationData);
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
                                            async (err, currentCustomer) => {
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
                                                    const doc = new jsPDF();
                                                    let yPosition = 10;
                                                    const gapY = 8;
                                                    const marginX = 15;
                                                    const logoY = yPosition;

                                                    const createdAt = new Date(davData.created_at);
                                                    const formattedDate = createdAt.toLocaleString('en-GB', {
                                                        day: '2-digit',
                                                        month: 'short',
                                                        year: 'numeric',
                                                        hour: '2-digit',
                                                        minute: '2-digit',
                                                        second: '2-digit',
                                                        hour12: true,
                                                    }).replace(',', '');
                                                    const pageWidth = doc.internal.pageSize.getWidth() - 30; // 15 left + 15 right
                                                    // --- Add Logo (smaller width, left side) ---
                                                    const LogoimageWidth = 30;
                                                    const LogoimageHeight = 15;
                                                    const logoX = marginX;
                                                    const titleX = marginX + LogoimageWidth + 10; // Space between logo and title
                                                    const textY = logoY + LogoimageHeight / 2 + 1.5; // vertical center of the logo
                                                    // Load and add the logo
                                                    const imageData = await fetchImageToBase(LogoImg);
                                                    doc.addImage(imageData, 'PNG', logoX, yPosition, LogoimageWidth, LogoimageHeight);
                                                    yPosition += 30; // Adjust Y after logo
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');

                                                    doc.text(
                                                        'Digital Address Verification Form',
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY,
                                                        { align: 'right' }
                                                    );
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');
                                                    doc.text(
                                                        formattedDate,
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY + 6,
                                                        { align: 'right' }
                                                    );

                                                    const lineStartX = marginX;
                                                    const lineEndX = doc.internal.pageSize.getWidth() - marginX;
                                                    const lineY = textY + 10;

                                                    doc.setDrawColor(0); // black
                                                    doc.setLineWidth(0.3);
                                                    doc.line(lineStartX, lineY, lineEndX, lineY);

                                                    yPosition = lineY + gapY - 2;
                                                    console.log('davData', davData)
                                                    const fullAddress = [
                                                        davData.house_flat_no,
                                                        davData.street_adress,
                                                        davData.locality_name,
                                                        davData.landmark,
                                                        davData.city,
                                                        davData.state,
                                                        davData.country
                                                    ].filter(Boolean).join(', ');

                                                    const distanceKm = calculateDistanceInKm(
                                                        davData.latitude, davData.longitude,
                                                        davData.address_latitude, davData.address_longitude,
                                                    );

                                                    // console.log(`Distance: ${distanceKm} km`);

                                                    if (typeof doc.autoTable !== 'function') {
                                                        throw new Error('jspdf-autotable plugin is not loaded.');
                                                    }

                                                    // Section: Candidate Residential Address Detail
                                                    doc.autoTable({
                                                        startY: yPosition,
                                                        head: [[{
                                                            content: 'Candidate Residential Address Detail',
                                                            colSpan: 4,
                                                            styles: {
                                                                halign: 'left',
                                                                fontSize: 12,
                                                                fontStyle: 'bold',
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80],
                                                            }
                                                        }]],
                                                        body: [
                                                            [
                                                                { content: "Candidate Name", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.name || "N/A", colSpan: 3, styles: { overflow: 'linebreak' } }
                                                            ],
                                                            [
                                                                { content: "Address", styles: { fontStyle: 'bold' } },
                                                                { content: fullAddress || "N/A", colSpan: 3, styles: { overflow: 'linebreak' } }
                                                            ],
                                                            [
                                                                { content: "Company Name", styles: { fontStyle: 'bold' } },
                                                                { content: companyName || "N/A" },
                                                                { content: "Relation With the candidate", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.relation_with_verifier || "N/A" }
                                                            ],
                                                            [
                                                                { content: "Mobile", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.mobile_number || "N/A" },
                                                                { content: "Period of Stay", styles: { fontStyle: 'bold' } },
                                                                { content: `${davData?.from_date || "N/A"} - ${davData?.to_date || "N/A"}` }
                                                            ],
                                                            [
                                                                { content: "Verification Date", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.verification_date || "N/A" },
                                                                { content: "Employee ID:", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.employee_id || "N/A" }
                                                            ],
                                                            [
                                                                { content: "Verifier Name", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.verifier_name || "N/A" },
                                                                { content: "Nature of Residence", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.nature_of_residence || "N/A" }
                                                            ],
                                                            [
                                                                { content: "Nearest Landmark", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.tourist_attraction_name || "N/A" },
                                                                { content: "Pincode", styles: { fontStyle: 'bold' } },
                                                                { content: davData?.pin_code || "N/A" }
                                                            ]
                                                        ],
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            cellPadding: 2,
                                                            fontSize: 10,
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0],
                                                            valign: 'middle',
                                                            overflow: 'linebreak'
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: 45 },
                                                            1: { cellWidth: 45 },
                                                            2: { cellWidth: 45 },
                                                            3: { cellWidth: 45 }
                                                        }
                                                    });


                                                    yPosition = doc.autoTable.previous.finalY + gapY;
                                                    doc.autoTable({
                                                        startY: yPosition,
                                                        head: [[{
                                                            content: 'Address shown on the map',
                                                            colSpan: 5,
                                                            styles: {
                                                                halign: 'left',
                                                                fontSize: 12,
                                                                fontStyle: 'bold',
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80],
                                                            }
                                                        }]],
                                                        body: [
                                                            [
                                                                { content: "Address", styles: { fontStyle: 'bold' } },
                                                                { content: 'Source' || "N/A", styles: { fontStyle: 'bold' } },
                                                                { content: 'Distance' || "N/A", styles: { fontStyle: 'bold' } },
                                                                { content: 'Location API', styles: { fontStyle: 'bold', whiteSpace: 'nowrap' } },
                                                                { content: 'Legend' || "N/A", styles: { fontStyle: 'bold' } },
                                                            ],
                                                            [
                                                                { content: fullAddress || "N/A" },
                                                                { content: 'Input Address' || "N/A" },
                                                                { content: '0km' || "N/A" },
                                                                {
                                                                    content: 'Google Location API', styles: {
                                                                        overflow: 'visible',
                                                                        cellWidth: 'auto'
                                                                    }
                                                                },
                                                                { content: '', styles: {} },  // leave blank, we'll draw in it
                                                            ],
                                                            [
                                                                { content: `${davData?.address_latitude || "N/A"} - ${davData?.address_longitude || "N/A"}` },
                                                                { content: 'GPS' || "N/A" },
                                                                { content: distanceKm ? `${distanceKm} km` : "N/A" },
                                                                { content: 'Google Location API', styles: { whiteSpace: 'nowrap' } },
                                                                { content: '', styles: {} },  // leave blank, we'll draw in it
                                                            ]
                                                        ],
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            cellPadding: 2,
                                                            fontSize: 10,
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0],
                                                            valign: 'middle'
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: 60 }, // Address
                                                            1: { cellWidth: 30 }, // Source (Input Address)
                                                            2: { cellWidth: 30 }, // Distance
                                                            3: { cellWidth: 40 }, // Google Location API
                                                            4: { cellWidth: 20 }  // Legend (color box)
                                                        },
                                                        didDrawCell: function (data) {
                                                            // Only for legend cells (column index 4, rows 1 and 2)
                                                            if (data.column.index === 4 && (data.row.index === 1 || data.row.index === 2)) {
                                                                const boxSize = 6; // size of the square box
                                                                const padding = 2;
                                                                const x = data.cell.x + padding;
                                                                const y = data.cell.y + (data.cell.height - boxSize) / 2; // center vertically

                                                                if (data.row.index === 1) {
                                                                    doc.setFillColor(255, 165, 0); // Orange
                                                                } else if (data.row.index === 2) {
                                                                    doc.setFillColor(0, 0, 255); // Blue
                                                                }

                                                                doc.rect(x, y, boxSize, boxSize, 'F'); // Draw the filled square
                                                            }
                                                        }
                                                    });

                                                    doc.addPage()

                                                    doc.addImage(imageData, 'PNG', logoX, logoY, LogoimageWidth, LogoimageHeight);
                                                    yPosition += 30; // Adjust Y after logo
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');

                                                    doc.text(
                                                        'Digital Address Verification Form',
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY,
                                                        { align: 'right' }
                                                    );
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');
                                                    doc.text(
                                                        formattedDate,
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY + 6,
                                                        { align: 'right' }
                                                    );
                                                    doc.setDrawColor(0); // black
                                                    doc.setLineWidth(0.3);
                                                    doc.line(lineStartX, lineY, lineEndX, lineY);
                                                    yPosition = lineY + gapY - 2;

                                                    // === Map Generation ===
                                                    // yPosition = doc.autoTable.previous.finalY + gapY;

                                                    const imageWidth = pageWidth;
                                                    const imageHeight = (imageWidth * 2) / 3; // 3:2 ratio

                                                    const imageMapUrlFull = davData.static_map_picture.trim();
                                                    const mapImageFormat = getImageFormat(imageMapUrlFull);
                                                    let mapImg, mapWidth, mapHeight, mapImageBase64Img, mapImgWidth, mapImgHeight;
                                                    if (await checkImageExists(imageMapUrlFull)) {
                                                        mapImg = await validateImage(imageMapUrlFull);
                                                        if (mapImg) {
                                                            ({ mapWidth, mapHeight } = scaleImage(
                                                                mapImg,
                                                                doc.internal.pageSize.width - 20,
                                                                80
                                                            ));
                                                            mapImageBase64Img = await fetchImageAsBase64(mapImg.src);
                                                            // Calculate scaled dimensions for the image to fit within the cell
                                                            const maxCellWidth = 30; // Max width for the image in the cell
                                                            const maxCellHeight = 30; // Max height for the image in the cell

                                                            const scale = Math.min(
                                                                maxCellWidth / mapWidth,
                                                                maxCellHeight / mapHeight
                                                            );

                                                            mapImgWidth = mapWidth * scale;
                                                            mapImgHeight = mapHeight * scale;

                                                            doc.addImage(
                                                                mapImageBase64Img,
                                                                mapImageFormat,
                                                                marginX,
                                                                yPosition,
                                                                imageWidth,
                                                                imageHeight
                                                            );

                                                            yPosition += imageHeight + 10; // Adjust Y position after the image
                                                        }
                                                    }

                                                    // === Table 2: Personal Information ===
                                                    const personalBody = [
                                                        ["Full Name of the Applicant", davData?.name || "N/A"],
                                                        ["Id Card details (Passport/Dl/Resident Card/Adhaar)", davData?.id_card_details || "N/A"],
                                                        ["Verifier Name", davData?.verifier_name || "N/A"],
                                                        ["Relation With Verifier", davData?.relation_with_verifier || "N/A"],
                                                        ["House Number / Flat Number", davData?.house_flat_no || "N/A"],
                                                        ["Street Address", davData?.street_adress || "N/A"],
                                                        ["Locality Name", davData?.locality_name || "N/A"],
                                                        ["City", davData?.city || "N/A"],
                                                        ["State", davData?.state || "N/A"],
                                                        ["Country", davData?.country || "N/A"],
                                                        ["Nature of Residence", davData?.nature_of_residence || "N/A"],
                                                        ["Prominent Landmark", davData?.landmark || "N/A"],
                                                        ["Nearest Police Station", davData?.police_station || "N/A"],
                                                        ["Pin code", davData?.pin_code || "N/A"],
                                                        ["Email Id", davData?.email || "N/A"],
                                                        ["Employee ID", davData?.employee_id || "N/A"],
                                                        ["Mobile Number", davData?.mobile_number || "N/A"],
                                                        ["Latitude", davData?.latitude || "N/A"],
                                                        ["Longitude", davData?.longitude || "N/A"],
                                                        ["Type of ID Attached", davData?.id_type || "N/A"],
                                                        ["No of years staying in the address", davData?.years_staying || "N/A"],
                                                    ];

                                                    // Nearby Places Table
                                                    doc.autoTable({
                                                        startY: yPosition + 10, // Starts after previous table
                                                        head: [[{
                                                            content: 'Nearby Place Details',
                                                            colSpan: 5,
                                                            styles: {
                                                                halign: 'left',
                                                                fontSize: 12,
                                                                fontStyle: 'bold',
                                                                fillColor: [197, 217, 241],
                                                                textColor: [80, 80, 80],
                                                            }
                                                        }]],
                                                        body: [
                                                            [
                                                                { content: "Nearby Place", styles: { fontStyle: 'bold' } },
                                                                { content: "Name", styles: { fontStyle: 'bold' } },
                                                                { content: "Address", styles: { fontStyle: 'bold' } },
                                                                { content: "Latitude", styles: { fontStyle: 'bold' } },
                                                                { content: "Longitude", styles: { fontStyle: 'bold' } }
                                                            ],
                                                            [
                                                                { content: "Police Station" },
                                                                { content: davData?.police_station_name || "N/A" },
                                                                { content: davData?.police_station_address || "N/A" },
                                                                { content: davData?.police_station_latitude || "N/A" },
                                                                { content: davData?.police_station_longitude || "N/A" }
                                                            ],
                                                            [
                                                                { content: "Post Office" },
                                                                { content: davData?.post_office_name || "N/A" },
                                                                { content: davData?.post_office_address || "N/A" },
                                                                { content: davData?.post_office_latitude || "N/A" },
                                                                { content: davData?.post_office_longitude || "N/A" }
                                                            ],
                                                            [
                                                                { content: "Tourism Place" },
                                                                { content: davData?.tourist_attraction_name || "N/A" },
                                                                { content: davData?.tourist_attraction_address || "N/A" },
                                                                { content: davData?.tourist_attraction_latitude || "N/A" },
                                                                { content: davData?.tourist_attraction_longitude || "N/A" }
                                                            ]
                                                        ],
                                                        theme: 'grid',
                                                        margin: { top: 10, left: 15, right: 15 },
                                                        styles: {
                                                            cellPadding: 2,
                                                            fontSize: 10,
                                                            lineWidth: 0.2,
                                                            lineColor: [0, 0, 0],
                                                            valign: 'middle',
                                                            overflow: 'linebreak'
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: 36 },
                                                            1: { cellWidth: 36 },
                                                            2: { cellWidth: 36 },
                                                            3: { cellWidth: 36 },
                                                            4: { cellWidth: 36 }
                                                        }
                                                    });

                                                    doc.addPage()

                                                    doc.addImage(imageData, 'PNG', logoX, logoY, LogoimageWidth, LogoimageHeight);
                                                    yPosition += 30; // Adjust Y after logo
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');

                                                    doc.text(
                                                        'Digital Address Verification Form',
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY,
                                                        { align: 'right' }
                                                    );
                                                    doc.setFontSize(10);
                                                    doc.setFont('helvetica', 'bolditalic');
                                                    doc.text(
                                                        formattedDate,
                                                        doc.internal.pageSize.getWidth() - marginX,
                                                        textY + 6,
                                                        { align: 'right' }
                                                    );
                                                    doc.setDrawColor(0); // black
                                                    doc.setLineWidth(0.3);
                                                    doc.line(lineStartX, lineY, lineEndX, lineY);
                                                    yPosition = lineY + gapY - 2;

                                                    // yPosition = doc.lastAutoTable.finalY + 10;

                                                    const rawImageDataBox = [
                                                        { name: 'id / Proof', url: davData?.id_proof },
                                                        { name: 'House Name', url: davData?.house_name_main_door },
                                                        { name: 'Building Photo', url: davData?.building_photo },
                                                        { name: 'Nearest Landmark', url: davData?.nearest_landmark },
                                                        { name: 'Street Photo', url: davData?.street_photo }
                                                    ];

                                                    const imageDataBox = await Promise.all(
                                                        rawImageDataBox.map(async (img) => {
                                                            try {
                                                                const urls = img.url?.split(',').map(u => u.trim()).filter(Boolean); // Split and clean

                                                                if (!urls || urls.length === 0) {
                                                                    return { name: img.name, url: null };
                                                                }

                                                                // Convert only the first image to base64 (you can loop all if needed)
                                                                console.log(`🔄 Converting image to base64: ${img.name} -> ${urls[0]}`);
                                                                const base64Url = await toBase64FromUrl(urls[0]);
                                                                console.log(`✅ Converted: ${img.name}`);
                                                                return { name: img.name, url: base64Url };
                                                            } catch (error) {
                                                                console.error(`❌ Error converting image: ${img.name}`, error);
                                                                return { name: img.name, url: null };
                                                            }
                                                        })
                                                    );

                                                    const imageWidthBox = 70;
                                                    const imageHeightBox = 50;

                                                    console.log('📄 Generating autoTable...');
                                                    doc.autoTable({
                                                        startY: yPosition,

                                                        body: Array(Math.ceil(imageDataBox.length / 2)).fill().map(() => [null, null]),
                                                        margin: { top: 20, left: 20, right: 20, bottom: 20 },
                                                        styles: {
                                                            cellPadding: 2,
                                                            fontSize: 0,
                                                            minCellHeight: imageHeightBox + 20,
                                                            valign: 'top',
                                                            textColor: [0, 0, 0],
                                                            lineWidth: 0,
                                                            lineColor: [255, 255, 255],
                                                        },
                                                        columnStyles: {
                                                            0: { cellWidth: 'auto' },
                                                            1: { cellWidth: 'auto' },
                                                        },
                                                        didDrawCell: function (data) {
                                                            if (data.section !== 'body') return;

                                                            const { cell, row, column } = data;
                                                            const cellDataIndex = row.index * 2 + column.index; // 2 columns per row

                                                            const cellData = imageDataBox[cellDataIndex];
                                                            if (!cellData || !cellData.url || !cellData.name) return;

                                                            // Draw cell border
                                                            doc.setDrawColor(0, 0, 0);
                                                            doc.setLineWidth(0.5);
                                                            doc.rect(cell.x + 1, cell.y + 1, cell.width - 2, cell.height - 4);

                                                            // Center and position image
                                                            const imageXCenter = cell.x + (cell.width - imageWidthBox) / 2;
                                                            const imageYTop = cell.y + 5;

                                                            try {
                                                                doc.addImage(cellData.url, 'JPEG', imageXCenter, imageYTop, imageWidthBox, imageHeightBox);
                                                            } catch (e) {
                                                                console.warn(`Failed to render image at row ${row.index}, column ${column.index}: ${cellData.name}`, e);
                                                            }

                                                            // Add image label
                                                            const labelX = cell.x + 8;
                                                            let labelY = imageYTop + imageHeightBox + 5;

                                                            doc.setFontSize(9);
                                                            doc.setTextColor(0, 0, 0);
                                                            doc.text(cellData.name, labelX, labelY);

                                                            labelY += 5; // Move the next label slightly below the previous one
                                                            doc.text(`Location: ${davData?.address_latitude || "N/A"} , ${davData?.address_longitude || "N/A"}`, labelX, labelY);
                                                        },
                                                        useCss: true,
                                                    });


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
                                                        // doc.save(pdfFileName);

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
                                                    console.error("PDF generation error:", error);
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