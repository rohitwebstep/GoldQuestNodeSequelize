const ClientMasterTrackerModel = require("../models/admin/clientMasterTrackerModel");
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


const imagePath = path.join(__dirname, "../assets/images/iso-logo.jpg");
const imageData = fs.readFileSync(imagePath);
const isologo = `data:image/jpeg;base64,${imageData.toString("base64")}`;

const verifiedImagePath = path.join(__dirname, "../assets/images/verified.webp");
const verifiedImageData = fs.readFileSync(verifiedImagePath);
const verified = `data:image/jpeg;base64,${verifiedImageData.toString("base64")}`;

const getImageFormat = (url) => {
  const ext = url.split(".").pop().toLowerCase();
  if (ext === "png") return "PNG";
  if (ext === "jpg" || ext === "jpeg") return "JPEG";
  if (ext === "webp") return "WEBP";
  return "PNG"; // Default to PNG if not recognized
};

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
    // Use axios to fetch the image as a binary buffer
    const response = await axios.get(url, { responseType: "arraybuffer" });
    // Check if the image was fetched successfully
    if (response.status !== 200) {
      console.warn(
        `Image fetch failed for URL: ${url} with status: ${response.status}`
      );
      return null;
    }

    // Check if the response data is valid
    if (!response.data) {
      console.warn(`No data found in the response for URL: ${url}`);
      return null;
    }

    // Convert the response data to a Buffer
    const buffer = Buffer.from(response.data);

    // Use sharp to extract image metadata
    const metadata = await sharp(buffer).metadata();

    // If the metadata is invalid or not retrieved, return null
    if (!metadata) {
      console.warn(`Unable to fetch metadata for image from URL: ${url}`);
      return null;
    }
    // Return the image URL, width, and height in an array
    return { src: url, width: metadata.width, height: metadata.height };
  } catch (error) {
    console.error(`Error validating image from ${url}:`, error);
    return null;
  }
}

async function fetchImageAsBase64(imageUrls) {

  const convertToBase64 = async (url) => {
    const name = path.basename(url.trim());

    try {
      const response = await axios.get(url.trim(), { responseType: "arraybuffer" });
      const base64String = `data:image/png;base64,${Buffer.from(response.data, "binary").toString("base64")}`;

      return {
        name,
        url,
        base64: base64String
      };
    } catch (error) {
      return {
        name,
        url,
        base64: null,
        error: error.message
      };
    }
  };

  // 🔥 Normalize input to an array (even if it's a comma-separated string)
  let urlArray = [];
  if (Array.isArray(imageUrls)) {
    urlArray = imageUrls;
  } else if (typeof imageUrls === "string") {
    urlArray = imageUrls.split(",").map(url => url.trim()).filter(Boolean);
  } else {
    throw new Error("Invalid input: must be a string or array of strings.");
  }

  const results = await Promise.all(urlArray.map(convertToBase64));
  return results;
}

async function compressBase64Image(base64Str, maxWidth = 800, quality = 0.7) {
  try {
    // Remove base64 prefix and convert to Buffer
    const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, "");
    const buffer = Buffer.from(base64Data, "base64");

    // Load image metadata to preserve aspect ratio
    const image = sharp(buffer);
    const metadata = await image.metadata();

    const ratio = metadata.width / metadata.height;
    const targetWidth = Math.min(metadata.width, maxWidth);
    const targetHeight = Math.round(targetWidth / ratio);

    const resizedBuffer = await image
      .resize({ width: targetWidth })
      .jpeg({ quality: Math.floor(quality * 100) })
      .toBuffer();

    const compressedBase64 = `data:image/jpeg;base64,${resizedBuffer.toString("base64")}`;

    return {
      base64: compressedBase64,
      width: targetWidth,
      height: targetHeight,
      type: "JPEG"
    };
  } catch (error) {
    console.error("❌ Error compressing base64 image:", error.message);
    return null;
  }
}

function addFooter(doc, appHost) {
  // Define the height of the footer and its position
  const footerHeight = 15; // Footer height
  const pageHeight = doc.internal.pageSize.height; // Get the total page height
  const footerYPosition = pageHeight - footerHeight + 10; // Position footer closer to the bottom

  // Define page width and margins
  const pageWidth = doc.internal.pageSize.width;
  const margin = 10; // Margins on the left and right

  // Space between sections (adjust dynamically based on page width)
  const availableWidth = pageWidth - 2 * margin; // Usable width excluding margins
  const centerX = pageWidth / 2; // Center of the page

  // Insert text into the center column (centered)
  const footerText = `No 293/154/172, 4th Floor, Outer Ring Road, Kadubeesanahalli, Marathahalli, Bangalore-560103 | ${appHost}`;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0); // Set text color to black (RGB: 0, 0, 0)
  doc.setFontSize(7);
  doc.text(footerText, centerX, footerYPosition - 3, { align: "center" }); // Adjusted vertical position

  // Insert page number into the right column (right-aligned)
  const pageCount = doc.internal.getNumberOfPages(); // Get total number of pages
  const currentPage = doc.internal.getCurrentPageInfo().pageNumber; // Get current page number
  const pageNumberText = `Page ${currentPage} / ${pageCount}`;
  const pageNumberWidth = doc.getTextWidth(pageNumberText); // Calculate text width

  // Right-align page number with respect to the page width
  const pageNumberX = pageWidth - margin - pageNumberWidth;
  doc.text(pageNumberText, pageNumberX, footerYPosition - 3); // Adjusted vertical position

  // Draw a line above the footer
  doc.setLineWidth(0.3);
  doc.setDrawColor(0, 0, 0); // Set line color to black (RGB: 0, 0, 0)
  doc.line(
    margin,
    footerYPosition - 7,
    pageWidth - margin,
    footerYPosition - 7
  ); // Line above the footer
}

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

async function addImageToPDF(
  doc,
  imageUrl,
  imageFormat,
  centerXImage,
  yPosition
) {
  const img = await validateImage(imageUrl);

  if (img) {
    try {
      // Check if the image format is correct (PNG, JPEG, etc.)
      if (img.src && imageFormat) {
        doc.addImage(
          img.src,
          imageFormat,
          centerXImage,
          yPosition,
          img.width,
          img.height
        );
      }
    } catch (error) {
      console.error(`Failed to add image to PDF: ${imageUrl}`, error);
    }
  } else {
    console.warn(`Image validation failed for ${imageUrl}`);
  }
}

module.exports = {
  generatePDF: async (
    client_application_id,
    branch_id,
    pdfFileName,
    targetDirectory
  ) => {
    return new Promise((resolve, reject) => {
      // Fetch application data
      ClientMasterTrackerModel.applicationByID(
        client_application_id,
        branch_id,
        async (err, application) => {
          if (err) {
            console.error("Database error:", err);
            return reject(new Error(`Database error: ${err.message}`));
          }

          if (!application) {
            return reject(new Error("Application not found"));
          }

          Customer.getCustomerById(
            application.customer_id,
            async (err, currentCustomer) => {
              if (err) {
                console.error("Database error:", err);
                return reject(new Error(`Database error: ${err.message}`));
              }

              if (!currentCustomer) {
                return reject(new Error("Customer not found"));
              }

              const branchData = currentCustomer.name;

              // Fetch CMT Application Data
              ClientMasterTrackerModel.applicationDataByClientApplicationID(
                client_application_id, branch_id,
                async (err, CMTApplicationData) => {
                  if (err) {
                    console.error("Database error:", err);
                    return reject(new Error(`Database error: ${err.message}`));
                  }
                  // Split service_id into an array
                  const serviceIds = application.services
                    .split(",")
                    .map((id) => id.trim());
                  const annexureResults = [];
                  let pendingRequests = serviceIds.length;

                  if (pendingRequests === 0) {
                    reject(new Error("No service IDs to process."));
                  }

                  serviceIds.forEach((id) => {
                    ClientMasterTrackerModel.reportFormJsonByServiceID(
                      id,
                      (err, reportFormJson) => {
                        if (err) {
                          console.error(
                            `Error fetching report form JSON for service ID ${id}:`,
                            err
                          );
                          annexureResults.push({
                            service_id: id,
                            serviceStatus: false,
                            message: err.message,
                          });
                          finalizeRequest();
                          return;
                        }

                        if (!reportFormJson) {
                          console.warn(`Report form JSON not found for service ID ${id}`);
                          annexureResults.push({
                            service_id: id,
                            serviceStatus: false,
                            message: "Report form JSON not found",
                          });
                          finalizeRequest();
                          return;
                        }

                        const excel_sorting = reportFormJson.excel_sorting;
                        const parsedData = JSON.parse(reportFormJson.json);
                        const db_table = parsedData.db_table.replace(/-/g, "_"); // Modify table name
                        const heading = parsedData.heading;

                        ClientMasterTrackerModel.annexureData(
                          client_application_id,
                          db_table,
                          (err, annexureData) => {
                            if (err) {
                              console.error(
                                `Error fetching annexure data for service ID ${id}:`,
                                err
                              );
                              annexureResults.push({
                                service_id: id,
                                annexureStatus: false,
                                excel_sorting,
                                annexureData: null,
                                serviceStatus: true,
                                reportFormJson,
                                message: "An error occurred while fetching annexure data.",
                                error: err,
                              });
                            } else if (!annexureData) {
                              console.warn(`Annexure data not found for service ID ${id}`);
                              annexureResults.push({
                                service_id: id,
                                annexureStatus: false,
                                excel_sorting,
                                annexureData: null,
                                serviceStatus: true,
                                reportFormJson,
                                message: "Annexure Data not found.",
                              });
                            } else {
                              annexureResults.push({
                                service_id: id,
                                annexureStatus: true,
                                excel_sorting,
                                serviceStatus: true,
                                reportFormJson,
                                annexureData,
                                heading,
                              });
                            }
                            finalizeRequest();
                          }
                        );
                      }
                    );
                  });

                  async function finalizeRequest() {

                    // If no invalid token message, proceed with result filtering
                    const filteredResults = annexureResults.filter((item) => item != null);

                    const sortedFilteredResults = filteredResults.sort((a, b) => {
                      const orderA = a.annexureData && a.annexureData.sorting_order != null
                        ? parseInt(a.annexureData.sorting_order) || Number.MAX_SAFE_INTEGER
                        : Number.MAX_SAFE_INTEGER;

                      const orderB = b.annexureData && b.annexureData.sorting_order != null
                        ? parseInt(b.annexureData.sorting_order) || Number.MAX_SAFE_INTEGER
                        : Number.MAX_SAFE_INTEGER;

                      return orderA - orderB;
                    });

                    const fetchServicesData = sortedFilteredResults;

                    pendingRequests -= 1;
                    if (pendingRequests === 0) {
                      // Define the directory where the PDF will be saved
                      const directoryPath = path.join(targetDirectory);
                      const pdfPath = path.join(directoryPath, pdfFileName);

                      // Check if directory exists, and create it if not
                      if (!fs.existsSync(directoryPath)) {
                        fs.mkdirSync(directoryPath, { recursive: true });
                      }
                      // Retrieve application information for the reset link
                      AppModel.appInfo("frontend", async (err, appInfo) => {
                        if (err) {
                          console.error("Database error:", err);
                          return res.status(500).json({
                            status: false,
                            message:
                              "An error occurred while retrieving application information. Please try again.",
                          });
                        }

                        if (!appInfo) {
                          console.error(
                            "Database error during app info retrieval:",
                            err
                          );
                          return reject(
                            new Error("Information of the application not found.")
                          );
                        }

                        const appHost = appInfo.host || "www.example.com";
                        const appName = appInfo.name || "Example Company";

                        try {
                          const applicationInfo = CMTApplicationData;
                          const servicesDataRaw = fetchServicesData;

                          const servicesData = servicesDataRaw.filter(service => {
                            const status = service?.annexureData?.status;
                            const lowerStatus = typeof status === 'string' ? status.toLowerCase() : status;

                            return lowerStatus !== null &&
                              lowerStatus !== 'null' &&
                              lowerStatus !== 'nil' &&
                              lowerStatus !== '' &&
                              lowerStatus !== undefined;
                          });

                          const doc = new jsPDF();
                          const pageWidth = doc.internal.pageSize.getWidth();
                          let yPosition = 5;
                          const backgroundColor = '#f5f5f5';

                          const base64Logo = await fetchImageAsBase64(
                            "https://i0.wp.com/goldquestglobal.in/wp-content/uploads/2024/03/goldquestglobal.png?w=771&ssl=1"
                          );

                          doc.addImage(base64Logo?.[0]?.base64, 'PNG', 10, yPosition, 50, 30);

                          const rightImageX = pageWidth - 10 - 70; // Page width minus margin (10) and image width (50)
                          doc.addImage(isologo, 'PNG', rightImageX + 34, yPosition, 30, 25);

                          if (applicationInfo?.photo) {
                            const imageBases = await fetchImageAsBase64([applicationInfo?.photo.trim()]);
                            doc.addImage(imageBases?.[0]?.base64 || "https://static-00.iconduck.com/assets.00/profile-circle-icon-512x512-zxne30hp.png", 'PNG', rightImageX, yPosition, 25, 25);

                          } else {

                          }


                          doc.setFont('helvetica', 'bold');
                          doc.setFontSize(10);
                          doc.setTextColor(0, 0, 0);

                          doc.text("CONFIDENTIAL BACKGROUND VERIFICATION REPORT", 105, 40, { align: 'center' });

                          const getStatusColor = (status) => {
                            let statusColor;
                            let statusText = status;  // Remove 'completed_' and convert to uppercase
                            switch (statusText.toLowerCase()) {
                              case 'green':
                                statusColor = { textColor: 'green' }; // Green text
                                break;
                              case 'red':
                                statusColor = { textColor: 'red' }; // Red text
                                break;
                              case 'orange':
                                statusColor = { textColor: 'orange' }; // Orange text
                                break;
                              case 'yellow':
                                statusColor = { textColor: 'yellow' }; // Yellow text
                                break;
                              case 'pink':
                                statusColor = { textColor: 'pink' }; // Pink text
                                break;
                              default:
                                statusColor = { textColor: '#000000' }; // Default black text if no match
                                break;
                            }
                            return statusColor;
                          };

                          let updatedStatus;
                          if (applicationInfo?.purpose_of_application?.toLowerCase() === "normal bgv(employment)") {
                            updatedStatus = "EMPLOYMENT";
                          }

                          // First Table
                          const firstTableData = [
                            [
                              { content: 'Name of the Candidate', styles: { cellWidth: 'auto', fontStyle: 'bold' } },
                              { content: applicationInfo?.name || 'NA' },
                              { content: 'Client Name', styles: { cellWidth: 'auto', fontStyle: 'bold' } },
                              { content: branchData || 'NA' },
                            ],
                            [
                              { content: 'Application ID', styles: { fontStyle: 'bold' } },
                              { content: applicationInfo?.application_id || 'NA' },
                              { content: 'Report Status', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.report_status
                                  ? applicationInfo.report_status
                                    .replace(/[-_]/g, ' ') // Replace '-' and '_' with space
                                    .replace(/\b\w/g, char => char.toUpperCase()) // Capitalize each word
                                  : 'NA'
                              }

                            ],
                            [
                              { content: 'Date of Birth', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.dob
                                  ? new Date(applicationInfo.dob).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })
                                  : "NA"
                              },

                              { content: 'Application Received', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.created_at
                                  ? new Date(applicationInfo.created_at).toLocaleDateString("en-GB").replace(/\//g, "-")
                                  : "NA"
                              }


                            ],
                            [
                              { content: 'Candidate Employee ID', styles: { fontStyle: 'bold' } },
                              { content: applicationInfo?.employee_id || 'NA' },
                              { content: 'Insuff Cleared/Reopened', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.first_insuff_reopened_date
                                  ? new Date(applicationInfo.first_insuff_reopened_date).toLocaleDateString("en-GB").replace(/\//g, "-")
                                  : 'NA'
                              }

                            ],
                            [
                              { content: 'Report Type', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.report_type
                                  ? applicationInfo.report_type
                                    .replace(/[-_]/g, ' ') // Replace '-' and '_' with space
                                    .toUpperCase()
                                  : 'NA'
                              },

                              { content: 'Final Report Date', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.report_date
                                  ? new Date(applicationInfo.report_date).toLocaleDateString("en-GB").replace(/\//g, "-")
                                  : 'NA'
                              }
                            ],
                            [
                              { content: 'Verification Purpose', styles: { fontStyle: 'bold' } },
                              { content: updatedStatus || applicationInfo?.purpose_of_application || 'NA' },
                              { content: 'Overall Report Status', styles: { fontStyle: 'bold' } },
                              {
                                content: applicationInfo?.final_verification_status.toUpperCase() || 'NA', // Show only the color name (e.g., GREEN, RED, etc.)
                                styles: { fontStyle: 'bold', ...getStatusColor(applicationInfo?.final_verification_status) } // Apply dynamic text color
                              },
                            ],
                          ];

                          doc.autoTable({
                            head: [],  // Remove the header by setting it to an empty array
                            body: firstTableData,
                            styles: {
                              cellPadding: 2,
                              fontSize: 10,
                              valign: 'middle',
                              lineColor: [62, 118, 165],
                              lineWidth: 0.4,  // Border width for the table
                              textColor: '#000',  // Default text color
                            },
                            headStyles: {
                              fillColor: [255, 255, 255],  // Ensure no background color for the header
                              textColor: 0,                // Optional: Reset header text color
                              lineColor: [62, 118, 165],
                              lineWidth: 0.2,  // Reduced border width for header
                            },
                            theme: 'grid',
                            margin: { top: 50 },
                            // Customize the overall status text color
                            willDrawCell: (data) => {
                              const statusCell = data.cell.raw && data.cell.raw.content;
                              const statusRow = firstTableData[5];  // We assume the status row is in index 5

                              if (statusCell === statusRow[3].content) {
                                const { textColor } = getStatusColor(statusCell);
                                data.cell.styles.textColor = textColor;  // Apply dynamic text color
                              }
                            },
                          });


                          addFooter(doc, appHost);

                          const secondTableData = servicesData.map(item => {
                            const sourceKey = item.annexureData
                              ? Object.keys(item.annexureData).find(key => key.startsWith('info_source') || key.startsWith('information_source'))
                              : undefined;
                            const dateKey = item.annexureData && Object.keys(item.annexureData).find(key => key.includes('verified_date'));

                            return {
                              component: item.heading || 'NIL',
                              source: sourceKey ? item.annexureData[sourceKey] : 'NIL',
                              completedDate: dateKey && item.annexureData[dateKey] && !isNaN(new Date(item.annexureData[dateKey]).getTime())
                                ? new Date(item.annexureData[dateKey]).toLocaleDateString('en-GB').replace(/\//g, "-") // Use 'en-GB' for DD-MM-YYYY format
                                : 'NIL'
                              ,
                              status: item.annexureData && item.annexureData.status ? item.annexureData.status : 'Initiated',
                            };
                          });


                          // Filter secondTableData if report type is "Final"
                          const filteredSecondTableData = applicationInfo?.report_type.toLowerCase().includes('final')
                            ? secondTableData.filter(row =>
                              row.status?.toLowerCase().includes("completed") // Check if the status includes "completed"
                            )
                            : secondTableData.filter(row =>
                              [row.component, row.source, row.completedDate, row.status].some(value => (value || '').toLowerCase() !== 'nil')
                            );

                          // Now use the filteredSecondTableData in the jsPDF table generation
                          doc.autoTable({
                            head: [
                              [
                                {
                                  content: 'REPORT COMPONENT',
                                  rowSpan: 2,
                                  styles: {
                                    halign: 'center',
                                    valign: 'middle', // <== Vertically center text
                                    fillColor: "#6495ed",
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                    cellPadding: 3,
                                  },
                                },
                                {
                                  content: 'INFORMATION SOURCE',
                                  rowSpan: 2,
                                  styles: {
                                    halign: 'center',
                                    valign: 'middle', // <== Vertically center text
                                    fillColor: "#6495ed",
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                  },
                                },
                                {
                                  content: 'COMPONENT STATUS',
                                  colSpan: 2,
                                  styles: {
                                    halign: 'center',
                                    valign: 'middle',
                                    fillColor: "#6495ed",
                                    textColor: [255, 255, 255],
                                    fontStyle: 'bold',
                                  },
                                },
                              ],
                              [
                                {
                                  content: 'COMPLETED DATE',
                                  styles: {
                                    halign: 'center',
                                    fillColor: "#6495ed",
                                    textColor: [255, 255, 255],
                                    lineWidth: 0.4,
                                    fontStyle: 'bold',
                                  },
                                },
                                {
                                  content: 'VERIFICATION STATUS',
                                  styles: {
                                    halign: 'center',
                                    fillColor: "#6495ed",
                                    textColor: [255, 255, 255],
                                    lineWidth: 0.4,
                                    fontStyle: 'bold',
                                  },
                                },
                              ]
                            ],
                            body: filteredSecondTableData.map(row => {
                              let statusColor;
                              let statusText = row.status.replace(/^completed_/, '').toUpperCase(); // Remove 'completed_' and convert to uppercase

                              // Determine the color based on status
                              switch (statusText.toLowerCase()) {
                                case 'green':
                                  statusColor = { textColor: 'green' }; // Green text
                                  break;
                                case 'red':
                                  statusColor = { textColor: 'red' }; // Red text
                                  break;
                                case 'orange':
                                  statusColor = { textColor: 'orange' }; // Orange text
                                  break;
                                case 'yellow':
                                  statusColor = { textColor: 'yellow' }; // Yellow text
                                  break;
                                case 'pink':
                                  statusColor = { textColor: 'pink' }; // Pink text
                                  break;
                                default:
                                  statusColor = { textColor: '#000000' }; // Default black text if no match
                                  break;
                              }

                              if (row.component !== 'NIL') {
                                return [
                                  row.component || 'NIL',
                                  row.source || 'NIL',
                                  row.completedDate || 'NIL', // Show completedDate in its own column
                                  {
                                    content: statusText, // Show only the color name (e.g., GREEN, RED, etc.)
                                    styles: { halign: 'center', fontStyle: 'bold', ...statusColor } // Apply dynamic text color
                                  },
                                ];
                              }
                            }).filter(Boolean), // Filter out undefined rows from the map (if any)

                            styles: {
                              cellPadding: 2,
                              fontSize: 10,
                              valign: 'middle',
                              lineWidth: 0.3,
                              lineColor: "#6495ed",
                              textColor: [0, 0, 0],
                              tableLineColor: [100, 149, 237],
                            },
                            theme: 'grid',
                            headStyles: {
                              fillColor: [61, 117, 166],
                              textColor: [0, 0, 0],
                              lineWidth: 0.3,
                              fontStyle: 'bold',
                              lineColor: [61, 117, 166],
                            },
                            bodyStyles: {
                              lineColor: [61, 117, 166],
                              lineWidth: 0.3,
                            },
                            columnStyles: {
                              0: { halign: 'left' },
                              1: { halign: 'center' },
                              2: { halign: 'center' },
                              3: { halign: 'center' },
                            },
                          });



                          addFooter(doc, appHost);
                          const pageHeight = doc.internal.pageSize.height;
                          yPosition = doc.lastAutoTable.finalY || 0; // Current Y position


                          // Check if adding the space will exceed the page height


                          if (yPosition + 70 > pageHeight) {
                            addFooter(doc, appHost);  // Add the footer before adding a new page
                            doc.addPage();   // Add a new page
                            yPosition = 20;    // Reset currentY to start from the top of the new page
                          }


                          doc.setFont("helvetica", "bold");
                          doc.setFontSize(12);
                          doc.text("End of summary report", pageWidth / 2, yPosition + 10, { align: "center" });

                          const tableStartX = 15; // Adjusted X position for full-width table
                          const tableStartY = yPosition + 20; // Y position of the table
                          const totalTableWidth = pageWidth - 2 * tableStartX; // Total table width
                          const legendColumnWidth = 15; // Smaller width for the "Legend" column
                          const remainingTableWidth = totalTableWidth - legendColumnWidth; // Remaining space for other columns
                          const columnCount = 5; // Number of remaining columns
                          const otherColumnWidth = remainingTableWidth / columnCount; // Width of each remaining column
                          const tableHeight = 12; // Reduced height of the table
                          const boxWidth = 5; // Width of the color box
                          const boxHeight = 9; // Height of the color box
                          const textBoxGap = 1; // Gap between text and box

                          // Data for the columns
                          const columns = [
                            { label: "Legend:", color: null, description: "" },
                            { label: "", color: "#FF0000", description: "-Major discrepancy" },
                            { label: "", color: "#FFFF00", description: "-Minor discrepancy" },
                            { label: "", color: "#FFA500", description: "-Unable to verify" },
                            { label: "", color: "#FFC0CB", description: "-Pending from source" },
                            { label: "", color: "#008000", description: "-All clear" },
                          ];

                          // Set the border color
                          doc.setDrawColor("#3e76a5");


                          // Draw table border
                          doc.setLineWidth(0.5);
                          doc.rect(tableStartX, tableStartY, totalTableWidth, tableHeight);

                          // Draw columns
                          columns.forEach((col, index) => {
                            const columnStartX =
                              index === 0
                                ? tableStartX // "Legend" column starts at tableStartX
                                : tableStartX + legendColumnWidth + (index - 1) * otherColumnWidth; // Remaining columns start after the "Legend" column

                            const columnWidth = index === 0 ? legendColumnWidth : otherColumnWidth;

                            // Draw column separators
                            if (index > 0) {
                              doc.line(columnStartX, tableStartY, columnStartX, tableStartY + tableHeight);
                            }

                            // Add label text (for Legend)
                            if (col.label) {
                              doc.setFont("helvetica", "bold");
                              doc.setFontSize(7); // Reduced font size for better fit
                              doc.text(
                                col.label,
                                columnStartX + 3, // Padding for text inside "Legend" column
                                tableStartY + tableHeight / 2 + 2,
                                { baseline: "middle" }
                              );
                            }

                            // Add color box
                            if (col.color) {
                              const boxX = columnStartX + 3; // Adjusted padding for color box
                              const boxY = tableStartY + tableHeight / 2 - boxHeight / 2;
                              doc.setFillColor(col.color);
                              doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
                            }

                            // Add description text
                            if (col.description) {
                              doc.setFont("helvetica", "normal");
                              doc.setFontSize(7); // Reduced font size for better fit
                              const textX = columnStartX + 3 + boxWidth + textBoxGap;
                              const textY = tableStartY + tableHeight / 2 + 2;
                              doc.text(col.description, textX, textY, { baseline: "middle" });
                            }
                          });



                          addFooter(doc, appHost);


                          yPosition = 20;
                          let annexureIndex = 1;
                          let pageLoopCount = 0;
                          for (const service of servicesData) {
                            pageLoopCount += 1;
                            let reportFormJson;
                            let rows = [];

                            // Only process if report_type is "Final" and status includes "completed"
                            if (applicationInfo?.report_type.toLowerCase().includes('final') || applicationInfo?.report_type.toLowerCase().includes('interim')) {
                              const serviceStatus = service.annexureData?.status || "";
                              if (!serviceStatus.toLowerCase().includes("completed")) {
                                continue; // Skip this service if status does not include "completed"
                              }
                            }

                            try {
                              if (!service.reportFormJson || !service.reportFormJson.json) {
                                // Skip this service if reportFormJson is not found or is empty
                                console.warn('No reportFormJson found for this service');
                                continue; // Skip the rest of the loop for this service
                              }

                              // Attempt to parse the JSON string
                              reportFormJson = JSON.parse(service.reportFormJson.json);

                              // Only process if rows are present
                              rows = reportFormJson && Array.isArray(reportFormJson.rows) ? reportFormJson.rows : [];
                            } catch (error) {
                              console.warn('Failed to parse reportFormJson:', error);
                              continue; // Skip this service if parsing fails
                            }

                            if (rows.length === 0) {
                              console.warn('No rows found in reportFormJson for this service');
                              continue; // Skip if there are no rows
                            }

                            // Start adding content for the page if data is valid
                            let yPosition = 20;
                            const serviceData = [];

                            // Process the rows as needed
                            rows.forEach((row) => {
                              const inputLabel = row.inputs.length > 0 ? row.inputs[0].label || "Unnamed Label" : "Unnamed Label";

                              const valuesObj = {};

                              row.inputs.forEach((input) => {
                                const inputName = input.name;

                                let reportDetailsInputName = inputName.includes("report_details_") ? inputName : `report_details_${inputName}`;

                                if (input.label && typeof input.label === "string") {
                                  input.label = input.label.replace(/:/g, "");
                                }

                                if (service.annexureData) {
                                  const value = service.annexureData[inputName] !== undefined && service.annexureData[inputName] !== null
                                    ? service.annexureData[inputName]
                                    : "";

                                  const reportDetailsValue = service.annexureData[reportDetailsInputName] !== undefined && service.annexureData[reportDetailsInputName] !== null
                                    ? service.annexureData[reportDetailsInputName]
                                    : "";

                                  valuesObj[inputName] = value;
                                  valuesObj["isReportDetailsExist"] = !!reportDetailsValue;
                                  if (reportDetailsValue) {
                                    valuesObj[reportDetailsInputName] = reportDetailsValue;
                                  }

                                  valuesObj["name"] = inputName.replace("report_details_", "");
                                } else {
                                  valuesObj[inputName] = "";
                                  valuesObj["isReportDetailsExist"] = false;
                                  valuesObj[reportDetailsInputName] = "";
                                }
                              });

                              serviceData.push({
                                label: inputLabel,
                                values: valuesObj,
                              });
                            });
                            const tableData = serviceData.map((data) => {
                              if (!data || !data.values) {
                                return null;
                              }

                              const name = data.values.name;

                              // Check if name starts with 'annexure' or 'additional_fee', and skip those entries
                              if (!name || name.startsWith("annexure") || name.startsWith("additional_fee")) {
                                return null;
                              }

                              const isReportDetailsExist = data.values.isReportDetailsExist;
                              let value = data.values[name];
                              let reportDetails = data.values[`report_details_${name}`];

                              if (value === undefined || value === "" || (isReportDetailsExist && !reportDetails)) {
                                return null;
                              }

                              if (name.startsWith("verification_status")) {
                                value = String(value).toUpperCase();
                              }

                              function parseDate(value) {
                                if (typeof value !== "string") return value;

                                // Strict check for date-like formats
                                const isStrictDateFormat =
                                  /^\d{4}-\d{2}-\d{2}$/.test(value) || // YYYY-MM-DD
                                  /^\d{2}\/\d{2}\/\d{4}$/.test(value) || // DD/MM/YYYY or MM/DD/YYYY
                                  /^\d{4}-\d{2}-\d{2}T/.test(value); // ISO 8601

                                if (!isStrictDateFormat) return value;

                                const parsedDate = new Date(value);
                                return isNaN(parsedDate) ? value : parsedDate.toLocaleDateString('en-GB').replace(/\//g, '-');
                              }

                              if (isReportDetailsExist && reportDetails) {
                                return [data.label, parseDate(value), parseDate(reportDetails)];
                              } else {
                                return [data.label, parseDate(value)];
                              }
                            }).filter(Boolean);

                            // Skip table rendering if no valid tableData
                            if (tableData.length > 0) {
                              doc.addPage();
                              const pageWidth = doc.internal.pageSize.width;

                              let headingText = '';
                              if (reportFormJson && reportFormJson.heading) {
                                headingText = reportFormJson.heading.toUpperCase();
                              } else {
                                console.warn('Heading is missing or invalid.');
                              }

                              const backgroundColor = "#f5f5f5";
                              const backgroundColorHeading = "#6495ed";
                              const borderColor = "#6495ed";
                              const xsPosition = 15;
                              const rectHeight = 10;

                              doc.setFillColor(backgroundColorHeading);
                              doc.setDrawColor(borderColor);
                              doc.rect(xsPosition, yPosition, 180, rectHeight, "FD");

                              doc.setFontSize(12);
                              doc.setFont("helvetica", "bold");

                              const textHeight = doc.getTextDimensions(headingText).h;
                              const verticalCenter = yPosition + rectHeight / 2 + textHeight / 4;

                              doc.setTextColor("#fff");
                              doc.text(headingText, pageWidth / 2, verticalCenter, { align: "center" });

                              yPosition += rectHeight;

                              // Check if tableData is not empty before generating the table
                              doc.autoTable({
                                head: [
                                  [
                                    { content: "PARTICULARS", styles: { halign: "left" } },
                                    { content: "APPLICATION DETAILS", styles: { halign: "center" } },
                                    { content: "REPORT DETAILS", styles: { halign: "center" } },
                                  ]
                                ],
                                body: tableData.map((row) => {
                                  if (row.length === 2) {
                                    return [
                                      { content: row[0], styles: { halign: "left", fontStyle: 'bold' } },
                                      { content: row[1], colSpan: 2, styles: { halign: "left" } },
                                    ];
                                  } else {
                                    return [
                                      { content: row[0], styles: { halign: "left", fontStyle: 'bold' } },
                                      { content: row[1], styles: { halign: "left" } },
                                      { content: row[2], styles: { halign: "left" } },
                                    ];
                                  }
                                }),
                                startY: yPosition,
                                styles: {
                                  fontSize: 9,
                                  cellPadding: 3,
                                  lineWidth: 0.3,
                                  lineColor: [62, 118, 165],
                                },
                                theme: "grid",
                                headStyles: {
                                  fillColor: backgroundColor,
                                  textColor: [0, 0, 0],
                                  halign: "center",
                                  fontSize: 10,
                                },
                                bodyStyles: {
                                  textColor: [0, 0, 0],
                                  halign: "left",
                                  valign: "top", // ensures top-aligned text in taller cells
                                },
                                columnStyles: {
                                  0: { cellWidth: 180 / 3 },  // A4 width ~180mm (after margins)
                                  1: { cellWidth: 180 / 3 },
                                  2: { cellWidth: 180 / 3 },
                                },
                                margin: { top: 20, bottom: 20, left: 15, right: 15 },
                              });




                              addFooter(doc, appHost);
                              yPosition = doc.lastAutoTable.finalY + 5;
                              const remarksData = serviceData.find((data) => data.label === "Remarks");
                              if (remarksData) {
                                const remarks = service.annexureData[remarksData.values.name] || "No remarks available.";
                                doc.setFont("helvetica", "italic");
                                doc.setFontSize(10);
                                doc.setTextColor(100, 100, 100);
                                doc.text(`Remarks: ${remarks}`, 10, yPosition);
                                yPosition += 7;
                              }

                              // Main logic
                              const annexureData = service.annexureData || {}; // Ensure annexureData is an empty object if it's null or undefined

                              const annexureImagesKey = Object.keys(annexureData).find((key) =>
                                key.toLowerCase().startsWith("annexure") && !key.includes("[") && !key.includes("]")
                              );

                              if (annexureImagesKey) {
                                doc.addPage();

                                yPosition = 20;
                                const annexureImagesStr = annexureData[annexureImagesKey];
                                const annexureImagesSplitArr = annexureImagesStr ? annexureImagesStr.split(",") : [];

                                if (annexureImagesSplitArr.length === 0) {
                                  console.warn("⚠️ No annexure images available.");
                                  doc.setFont("helvetica", "italic");
                                  doc.setFontSize(10);
                                  doc.setTextColor(150, 150, 150);
                                  doc.text("No annexure images available.", 10, yPosition);
                                  yPosition += 10;
                                } else {
                                  let rawImageBases = await fetchImageAsBase64(annexureImagesStr.trim());

                                  if (!Array.isArray(rawImageBases)) {
                                    rawImageBases = [rawImageBases];
                                  }

                                  const imageBases = [];
                                  for (const image of rawImageBases) {
                                    if (!image.base64 || !image.base64.startsWith("data:image/")) {
                                      console.warn("❌ Skipping invalid image base64.", rawImageBases);
                                      continue;
                                    }

                                    const compressed = await compressBase64Image(image.base64, 800, 0.7);
                                    if (compressed) imageBases.push(compressed);
                                  }

                                  if (imageBases.length > 0) {
                                    imageBases.forEach(async (image, index) => {
                                      if (!image.base64.startsWith("data:image/")) {
                                        console.error(`❌ Invalid compressed base64 for image ${index + 1}`);
                                        return;
                                      }

                                      if (index > 0 && imageBases.length > 1) {
                                        doc.addPage();
                                      }

                                      const pageWidth = doc.internal.pageSize.width - 20;
                                      const pageHeight = doc.internal.pageSize.height - 40;

                                      let { width, height } = scaleImageForPDF(image.width, image.height, pageWidth, pageHeight);

                                      const centerX = (doc.internal.pageSize.width - width) / 2;
                                      const centerY = (doc.internal.pageSize.height - height) / 2;

                                      const annexureText = `Annexure ${annexureIndex} (${String.fromCharCode(97 + index)})`;

                                      doc.setFont("helvetica", "bold");
                                      doc.setFontSize(12);
                                      doc.setTextColor(0, 0, 0);
                                      doc.text(annexureText, doc.internal.pageSize.width / 2, 15, { align: "center" });

                                      try {
                                        doc.addImage(image.base64, image.type, centerX, centerY, width, height);
                                      } catch (error) {
                                        console.error(`❌ Error adding image ${index + 1}:`, error);
                                      }

                                      addFooter(doc, appHost);
                                    });
                                  } else {
                                    console.warn("⚠️ No valid images found after fetching and compressing.");
                                  }
                                }
                              } else {
                                console.warn("⚠️ No annexure images key found.");
                                doc.setFont("helvetica", "italic");
                                doc.setFontSize(10);
                                doc.setTextColor(150, 150, 150);
                                doc.text("No annexure images available.", 10, yPosition);
                                yPosition += 15;
                              }


                              /**
                               * Function to scale image properly within the page
                               */
                              function scaleImageForPDF(imageWidth, imageHeight, maxWidth, maxHeight) {
                                let width = imageWidth;
                                let height = imageHeight;

                                if (width > maxWidth) {
                                  height *= maxWidth / width;
                                  width = maxWidth;
                                }
                                if (height > maxHeight) {
                                  width *= maxHeight / height;
                                  height = maxHeight;
                                }

                                return { width, height };
                              }
                            }
                            addFooter(doc, appHost);
                            annexureIndex++;
                            yPosition += 20;
                          }


                          addFooter(doc, appHost);
                          doc.addPage();

                          const disclaimerButtonHeight = 10;
                          const disclaimerButtonWidth = doc.internal.pageSize.width - 20;

                          const buttonBottomPadding = 5;
                          const disclaimerTextTopMargin = 5;

                          const adjustedDisclaimerButtonHeight = disclaimerButtonHeight + buttonBottomPadding;

                          const disclaimerTextPart1 = `This report is confidential and is meant for the exclusive use of the Client. This report has been prepared solely for the purpose set out pursuant to our letter of engagement (LoE)/Agreement signed with you and is not to be used for any other purpose. The Client recognizes that we are not the source of the data gathered and our reports are based on the information purpose. The Client recognizes that we are not the source of the data gathered and our reports are based on the information responsible for employment decisions based on the information provided in this report.`;
                          const anchorText = "";
                          const disclaimerTextPart2 = "";


                          doc.setFont("helvetica", "normal");
                          doc.setFontSize(10);
                          doc.setTextColor(0, 0, 0);
                          const disclaimerLinesPart1 = doc.splitTextToSize(disclaimerTextPart1, disclaimerButtonWidth);
                          const disclaimerLinesPart2 = doc.splitTextToSize(disclaimerTextPart2, disclaimerButtonWidth);


                          const lineHeight = 7;
                          const disclaimerTextHeight =
                            disclaimerLinesPart1.length * lineHeight +
                            disclaimerLinesPart2.length * lineHeight +
                            lineHeight;

                          const totalContentHeight = adjustedDisclaimerButtonHeight + disclaimerTextHeight + disclaimerTextTopMargin;

                          const availableSpace = doc.internal.pageSize.height - 40;

                          let disclaimerY = 20;

                          if (disclaimerY + totalContentHeight > availableSpace) {
                            doc.addPage();
                            addFooter(doc, appHost);
                            disclaimerY = 20;
                          }

                          const disclaimerButtonXPosition = (doc.internal.pageSize.width - disclaimerButtonWidth) / 2;


                          if (disclaimerButtonWidth > 0 && disclaimerButtonHeight > 0 && !isNaN(disclaimerButtonXPosition) && !isNaN(disclaimerY)) {
                            doc.setDrawColor(62, 118, 165);
                            doc.setFillColor(backgroundColor);
                            doc.rect(disclaimerButtonXPosition, disclaimerY, disclaimerButtonWidth, disclaimerButtonHeight, 'F');
                            doc.rect(disclaimerButtonXPosition, disclaimerY, disclaimerButtonWidth, disclaimerButtonHeight, 'D');
                          } else {
                          }

                          doc.setTextColor(0, 0, 0);
                          doc.setFont("helvetica", "bold");

                          const disclaimerButtonTextWidth = doc.getTextWidth('Disclaimer');
                          const buttonTextHeight = doc.getFontSize();


                          const disclaimerTextXPosition =
                            disclaimerButtonXPosition + disclaimerButtonWidth / 2 - disclaimerButtonTextWidth / 2 - 1;
                          const disclaimerTextYPosition = disclaimerY + disclaimerButtonHeight / 2 + buttonTextHeight / 4 - 1;

                          doc.text('Disclaimer', disclaimerTextXPosition, disclaimerTextYPosition);

                          let currentY = disclaimerY + adjustedDisclaimerButtonHeight + disclaimerTextTopMargin;

                          doc.setFont("helvetica", "normal");
                          doc.setTextColor(0, 0, 0);
                          disclaimerLinesPart1.forEach((line) => {
                            doc.text(line, 10, currentY);
                            currentY += lineHeight;
                          });

                          doc.setTextColor(0, 0, 255);
                          doc.textWithLink(anchorText, 10 + doc.getTextWidth(disclaimerLinesPart1[disclaimerLinesPart1.length - 1]), currentY - lineHeight, {
                            url: "mailto:goldquest.in",
                          });

                          doc.setTextColor(0, 0, 0);
                          disclaimerLinesPart2.forEach((line) => {
                            doc.text(line, 10, currentY);
                            currentY += lineHeight;
                          });

                          let endOfDetailY = currentY + disclaimerTextTopMargin - 5;

                          if (endOfDetailY + disclaimerButtonHeight > doc.internal.pageSize.height - 20) {
                            doc.addPage();
                            endOfDetailY = 20;
                          }

                          const endButtonXPosition = (doc.internal.pageSize.width - disclaimerButtonWidth) / 2; // Centering horizontally

                          if (disclaimerButtonWidth > 0 && disclaimerButtonHeight > 0 && !isNaN(endButtonXPosition) && !isNaN(endOfDetailY)) {
                            doc.setDrawColor(62, 118, 165);
                            doc.setFillColor(backgroundColor);
                            doc.rect(endButtonXPosition, endOfDetailY, disclaimerButtonWidth, disclaimerButtonHeight, 'F');
                            doc.rect(endButtonXPosition, endOfDetailY, disclaimerButtonWidth, disclaimerButtonHeight, 'D');
                          } else {
                          }

                          doc.setTextColor(0, 0, 0);
                          doc.setFont("helvetica", "bold");

                          const endButtonTextWidth = doc.getTextWidth('End of detail report');
                          const endButtonTextHeight = doc.getFontSize();

                          const endButtonTextXPosition =
                            endButtonXPosition + disclaimerButtonWidth / 2 - endButtonTextWidth / 2 - 1;
                          const endButtonTextYPosition = endOfDetailY + disclaimerButtonHeight / 2 + endButtonTextHeight / 4 - 1;

                          doc.text('End of detail report', endButtonTextXPosition, endButtonTextYPosition);


                          // Calculate the width and height of the image dynamically using jsPDF's getImageProperties
                          const imgWidth = 50;  // Adjust this scale factor as needed
                          const imgHeight = 40; // Adjust this scale factor as needed

                          // Calculate the X position to center the image horizontally
                          const centerX = (pageWidth - imgWidth) / 2;

                          // Calculate the Y position (adjust this based on where you want the image)
                          const centerY = endOfDetailY + 20; // Example: Place the image 20 units below the "END OF DETAIL REPORT" text

                          // Add the image to the PDF at the calculated position
                          doc.addImage(verified, 'JPEG', centerX, centerY, imgWidth, imgHeight);

                          addFooter(doc, appHost);

                          // doc.save(`123.pdf`);

                          const pdfPathCloud = await savePdf(
                            doc,
                            pdfFileName,
                            targetDirectory
                          );
                          // doc.save(pdfPath);
                          resolve(pdfPathCloud);
                        }
                        catch (error) {
                          console.error("PDF generation error:", error);
                          reject(new Error("Error generating PDF"));
                        }
                      });
                    }
                  }
                }
              );
            }
          );
        }
      );
    });
  },
};
