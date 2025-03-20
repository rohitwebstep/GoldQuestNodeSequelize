const ClientMasterTrackerModel = require("../models/admin/clientMasterTrackerModel");
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
    client_applicaton_id,
    branch_id,
    pdfFileName,
    targetDirectory
  ) => {
    return new Promise((resolve, reject) => {
      // Fetch application data
      ClientMasterTrackerModel.applicationByID(
        client_applicaton_id,
        branch_id,
        async (err, application) => {
          if (err) {
            console.error("Database error:", err);
            return reject(new Error(`Database error: ${err.message}`));
          }

          if (!application) {
            return reject(new Error("Application not found"));
          }
          // Fetch CMT Application Data
          ClientMasterTrackerModel.getCMTApplicationById(
            client_applicaton_id,
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
                      console.warn(
                        `Report form JSON not found for service ID ${id}`
                      );
                      annexureResults.push({
                        service_id: id,
                        serviceStatus: false,
                        message: "Report form JSON not found",
                      });
                      finalizeRequest();
                      return;
                    }

                    const parsedData = JSON.parse(reportFormJson.json);
                    const db_table = parsedData.db_table.replace(/-/g, "_"); // Modify table name
                    const heading = parsedData.heading;

                    ClientMasterTrackerModel.annexureData(
                      client_applicaton_id,
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
                            annexureData: null,
                            serviceStatus: true,
                            reportFormJson,
                            message:
                              "An error occurred while fetching annexure data.",
                            error: err,
                          });
                        } else if (!annexureData) {
                          console.warn(
                            `Annexure data not found for service ID ${id}`
                          );
                          annexureResults.push({
                            service_id: id,
                            annexureStatus: false,
                            annexureData: null,
                            serviceStatus: true,
                            reportFormJson,
                            message: "Annexure Data not found.",
                          });
                        } else {
                          annexureResults.push({
                            service_id: id,
                            annexureStatus: true,
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
                      const filteredResults = annexureResults.filter(
                        (item) => item != null
                      );
                      const servicesData = filteredResults;
                      const doc = new jsPDF();
                      const pageWidth = doc.internal.pageSize.getWidth();
                      let yPosition = 10;
                      const backgroundColor = "#f5f5f5";

                      const base64Logo = await fetchImageAsBase64(
                        "https://i0.wp.com/goldquestglobal.in/wp-content/uploads/2024/03/goldquestglobal.png"
                      );
                      // Add the image to the PDF
                      doc.addImage(base64Logo, "PNG", 10, yPosition, 50, 20);

                      const rightImageX = pageWidth - 10 - 50;

                      doc.addImage(
                        await fetchImageAsBase64(
                          "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSjDtQL92lFVchI1eVL0Gpb7xrNnkqW1J7c1A&s"
                        ),
                        "PNG",
                        rightImageX,
                        yPosition,
                        50,
                        30
                      );

                      doc.setFont("helvetica", "bold");
                      doc.setFontSize(10);
                      doc.setTextColor(0, 0, 0);

                      doc.text(
                        "CONFIDENTIAL BACKGROUND VERIFICATION REPORT",
                        105,
                        40,
                        {
                          align: "center",
                        }
                      );
                      // First Table
                      const firstTableData = [
                        [
                          {
                            content: "Name of the Candidate",
                            styles: {
                              cellWidth: "auto",
                              fontStyle: "bold",
                            },
                          },
                          { content: application.name || "N/A" },
                          {
                            content: "Client Name",
                            styles: {
                              cellWidth: "auto",
                              fontStyle: "bold",
                            },
                          },
                          {
                            content: application.customer_name || "N/A",
                          },
                        ],
                        [
                          {
                            content: "Application ID",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.application_id || "N/A",
                          },
                          {
                            content: "Report Status",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.report_status || "N/A",
                          },
                        ],
                        [
                          {
                            content: "Date of Birth",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: CMTApplicationData.dob
                              ? new Date(
                                CMTApplicationData.dob
                              ).toLocaleDateString()
                              : "N/A",
                          },
                          {
                            content: "Application Received",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.updated_at
                              ? new Date(
                                application.updated_at
                              ).toLocaleDateString()
                              : "N/A",
                          },
                        ],
                        [
                          {
                            content: "Candidate Employee ID",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.employee_id || "N/A",
                          },
                          {
                            content: "Insuff Cleared/Reopened",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.application_id || "N/A",
                          },
                        ],
                        [
                          {
                            content: "Report Type",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.report_type || "N/A",
                          },
                          {
                            content: "Final Report Date",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: CMTApplicationData.report_date
                              ? new Date(
                                CMTApplicationData.report_date
                              ).toLocaleDateString()
                              : "N/A",
                          },
                        ],
                        [
                          {
                            content: "Verification Purpose",
                            styles: { fontStyle: "bold" },
                          },
                          {
                            content: application.overall_status || "N/A",
                          },
                          {
                            content: "Overall Report Status",
                            styles: { fontStyle: "bold" },
                          },
                          { content: application.status || "N/A" },
                        ],
                      ];
                      doc.autoTable({
                        head: [], // Remove the header by setting it to an empty array
                        body: firstTableData,
                        styles: {
                          cellPadding: 3,
                          fontSize: 10,
                          valign: "middle",
                          lineColor: [62, 118, 165],
                          lineWidth: 0.4, // Reduced border width (you can adjust this value further)
                          textColor: "#000", // Set text color to black (#000)
                        },
                        headStyles: {
                          fillColor: [255, 255, 255], // Ensure no background color for header
                          textColor: 0, // Optional: Ensure header text color is reset (not needed if header is removed)
                          lineColor: [62, 118, 165],
                          lineWidth: 0.2, // Reduced border width for header (if header is re-enabled)
                        },
                        theme: "grid",
                        margin: { top: 50 },
                      });
                      addFooter(doc, appHost);
                      const secondTableData = servicesData.map((item) => {
                        const sourceKey = item.annexureData
                          ? Object.keys(item.annexureData).find(
                            (key) =>
                              key.startsWith("info_source") ||
                              key.startsWith("information_source") ||
                              key.endsWith("info_source") ||
                              key.endsWith("information_source")
                          )
                          : undefined;
                        const dateKey =
                          item.annexureData &&
                          Object.keys(item.annexureData).find((key) =>
                            key.includes("verified_date")
                          );

                        return {
                          component: item.heading || "NIL",
                          source: sourceKey
                            ? item.annexureData[sourceKey]
                            : "NIL",
                          completedDate:
                            dateKey &&
                              item.annexureData[dateKey] &&
                              !isNaN(
                                new Date(item.annexureData[dateKey]).getTime()
                              )
                              ? new Date(
                                item.annexureData[dateKey]
                              ).toLocaleDateString()
                              : "NIL",
                          status:
                            item.annexureData && item.annexureData.status
                              ? item.annexureData.status.replace(/[_-]/g, " ")
                              : "NIL",
                        };
                      });
                      // Generate the Second Table
                      doc.autoTable({
                        head: [
                          [
                            {
                              content: "REPORT COMPONENT",
                              styles: {
                                halign: "center",
                                fillColor: "#6495ed",
                                lineColor: [255, 255, 255],
                                textColor: [0, 0, 0],
                                fontStyle: "bold",
                              },
                            },
                            {
                              content: "INFORMATION SOURCE",
                              styles: {
                                halign: "center",
                                fillColor: "#6495ed",
                                lineColor: [255, 255, 255],
                                textColor: [0, 0, 0],
                                fontStyle: "bold",
                              },
                            },
                            {
                              content: "COMPLETED DATE",
                              styles: {
                                halign: "center",
                                fillColor: "#6495ed",
                                lineColor: [255, 255, 255],
                                textColor: [0, 0, 0],
                                fontStyle: "bold",
                              },
                            },
                            {
                              content: "COMPONENT STATUS",
                              styles: {
                                halign: "center",
                                fillColor: "#6495ed",
                                lineColor: [255, 255, 255],
                                textColor: [0, 0, 0],
                                fontStyle: "bold",
                              },
                            },
                          ],
                        ],
                        body: secondTableData.map((row) => [
                          row.component,
                          row.source,
                          row.completedDate, // Show completedDate in its own column
                          row.status, // Show status in its own column
                        ]),
                        styles: {
                          cellPadding: 3,
                          fontSize: 10,
                          valign: "middle",
                          lineWidth: 0.3,
                          lineColor: "#6495ed",
                        },
                        theme: "grid",
                        headStyles: {
                          lineWidth: 0.4, // No border for the header
                          fillColor: [61, 117, 166], // Color for the header background
                          textColor: [0, 0, 0], // Text color for the header
                          fontStyle: "bold",
                        },
                        bodyStyles: {
                          lineWidth: 0.5, // Border for the body rows
                          lineColor: [61, 117, 166], // Border color for the body
                        },
                        columnStyles: {
                          0: { halign: "left" },
                          1: { halign: "center" },
                          2: { halign: "center" }, // Center alignment for the completed date column
                          3: { halign: "center" }, // Center alignment for the status column
                        },
                      });
                      addFooter(doc, appHost);

                      const tableStartX = 15; // Adjusted X position for full-width table
                      const tableStartY = doc.previousAutoTable.finalY + 20; // Y position of the table
                      const totalTableWidth = pageWidth - 2 * tableStartX; // Total table width
                      const legendColumnWidth = 15; // Smaller width for the "Legend" column
                      const remainingTableWidth =
                        totalTableWidth - legendColumnWidth; // Remaining space for other columns
                      const columnCount = 5; // Number of remaining columns
                      const otherColumnWidth =
                        remainingTableWidth / columnCount; // Width of each remaining column
                      const tableHeight = 12; // Reduced height of the table
                      const boxWidth = 5; // Width of the color box
                      const boxHeight = 9; // Height of the color box
                      const textBoxGap = 1; // Gap between text and box
                      // Data for the columns
                      const columns = [
                        { label: "Legend:", color: null, description: "" },
                        {
                          label: "",
                          color: "#FF0000",
                          description: "-Major discrepancy",
                        },
                        {
                          label: "",
                          color: "#FFFF00",
                          description: "-Minor discrepancy",
                        },
                        {
                          label: "",
                          color: "#FFA500",
                          description: "-Unable to verify",
                        },
                        {
                          label: "",
                          color: "#FFC0CB",
                          description: "-Pending from source",
                        },
                        {
                          label: "",
                          color: "#008000",
                          description: "-All clear",
                        },
                      ];
                      // Set the border color
                      doc.setDrawColor("#3e76a5");

                      // Draw table border
                      doc.setLineWidth(0.5);
                      doc.rect(
                        tableStartX,
                        tableStartY,
                        totalTableWidth,
                        tableHeight
                      );
                      // Draw columns
                      columns.forEach((col, index) => {
                        const columnStartX =
                          index === 0
                            ? tableStartX // "Legend" column starts at tableStartX
                            : tableStartX +
                            legendColumnWidth +
                            (index - 1) * otherColumnWidth; // Remaining columns start after the "Legend" column

                        const columnWidth =
                          index === 0 ? legendColumnWidth : otherColumnWidth;

                        // Draw column separators
                        if (index > 0) {
                          doc.line(
                            columnStartX,
                            tableStartY,
                            columnStartX,
                            tableStartY + tableHeight
                          );
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
                          const boxY =
                            tableStartY + tableHeight / 2 - boxHeight / 2;
                          doc.setFillColor(col.color);
                          doc.rect(boxX, boxY, boxWidth, boxHeight, "F");
                        }

                        // Add description text
                        if (col.description) {
                          doc.setFont("helvetica", "normal");
                          doc.setFontSize(7); // Reduced font size for better fit
                          const textX =
                            columnStartX + 3 + boxWidth + textBoxGap;
                          const textY = tableStartY + tableHeight / 2 + 2;
                          doc.text(col.description, textX, textY, {
                            baseline: "middle",
                          });
                        }
                      });
                      doc.setFont("helvetica", "bold");
                      doc.setFontSize(12);
                      doc.text(
                        "End of summary report",
                        pageWidth / 2,
                        doc.previousAutoTable.finalY + 10,
                        { align: "center" }
                      );

                      addFooter(doc, appHost);
                      yPosition = 20;
                      let annexureIndex = 1;
                      for (const service of servicesData) {
                        doc.addPage();
                        addFooter(doc, appHost);

                        let yPosition = 20;

                        console.log(`service - `, service);

                        if (!service.reportFormJson || !service.reportFormJson.json) {
                          console.error("reportFormJson or reportFormJson.json does not exist.");
                          continue;
                        }

                        const reportFormJson = JSON.parse(
                          service.reportFormJson.json
                        );
                        const rows = reportFormJson.rows || [];
                        const serviceData = [];

                        rows.forEach((row) => {
                          const inputLabel =
                            row.inputs.length > 0
                              ? row.inputs[0].label || "Unnamed Label"
                              : "Unnamed Label";

                          const valuesObj = {};

                          row.inputs.forEach((input) => {
                            const inputName = input.name;
                            let reportDetailsInputName = inputName.includes(
                              "report_details_"
                            )
                              ? inputName
                              : `report_details_${inputName}`;

                            if (
                              input.label &&
                              typeof input.label === "string"
                            ) {
                              input.label = input.label.replace(/:/g, "");
                            }
                            if (service.annexureData) {
                              const value =
                                service.annexureData[inputName] !== undefined &&
                                  service.annexureData[inputName] !== null
                                  ? service.annexureData[inputName]
                                  : "";

                              const reportDetailsValue =
                                service.annexureData[reportDetailsInputName] !==
                                  undefined &&
                                  service.annexureData[reportDetailsInputName] !==
                                  null
                                  ? service.annexureData[reportDetailsInputName]
                                  : "";
                              valuesObj[inputName] = value;
                              valuesObj["isReportDetailsExist"] =
                                !!reportDetailsValue;
                              if (reportDetailsValue) {
                                valuesObj[reportDetailsInputName] =
                                  reportDetailsValue;
                              }

                              valuesObj["name"] = inputName.replace(
                                "report_details_",
                                ""
                              );
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
                        const tableData = serviceData
                          .map((data) => {
                            if (!data || !data.values) {
                              console.log(
                                "Skipping invalid data (empty values)."
                              );
                              return null;
                            }

                            const name = data.values.name;
                            if (!name || name.startsWith("annexure")) {
                              return null;
                            }

                            const isReportDetailsExist =
                              data.values.isReportDetailsExist;
                            const value = data.values[name];
                            const reportDetails =
                              data.values[`report_details_${name}`];

                            if (
                              value === undefined ||
                              value === "" ||
                              (isReportDetailsExist && !reportDetails)
                            ) {
                              console.log(
                                "Skipping data due to missing value or report details."
                              );
                              return null;
                            }

                            if (isReportDetailsExist && reportDetails) {
                              return [data.label, value, reportDetails];
                            } else {
                              return [data.label, value];
                            }
                          })
                          .filter(Boolean);
                        const pageWidth = doc.internal.pageSize.width;

                        const headingText =
                          reportFormJson.heading.toUpperCase();
                        const backgroundColor = "#f5f5f5";
                        const backgroundColorHeading = "#6495ed";
                        const borderColor = "#6495ed";
                        const xsPosition = 10;
                        const rectHeight = 10;

                        doc.setFillColor(backgroundColorHeading);
                        doc.setDrawColor(borderColor);
                        doc.rect(
                          xsPosition,
                          yPosition,
                          pageWidth - 20,
                          rectHeight,
                          "FD"
                        );
                        doc.setFontSize(12);
                        doc.setFont("helvetica", "bold");

                        const textHeight = doc.getTextDimensions(headingText).h;
                        const verticalCenter =
                          yPosition + rectHeight / 2 + textHeight / 4;

                        doc.setTextColor("#fff");
                        doc.text(headingText, pageWidth / 2, verticalCenter, {
                          align: "center",
                        });

                        yPosition += rectHeight;
                        doc.autoTable({
                          head: [
                            [
                              {
                                content: "PARTICULARS",
                                styles: { halign: "left" },
                              },
                              "APPLICATION DETAILS",
                              "REPORT DETAILS",
                            ],
                          ],
                          body: tableData.map((row) => {
                            if (row.length === 2) {
                              return [
                                {
                                  content: row[0],
                                  styles: {
                                    halign: "left",
                                    fontStyle: "bold",
                                  },
                                },
                                {
                                  content: row[1],
                                  colSpan: 2,
                                  styles: { halign: "left" },
                                },
                              ];
                            } else {
                              return [
                                {
                                  content: row[0],
                                  styles: {
                                    halign: "left",
                                    fontStyle: "bold",
                                  },
                                },
                                {
                                  content: row[1],
                                  styles: { halign: "left" },
                                },
                                {
                                  content: row[2],
                                  styles: { halign: "left" },
                                },
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
                          },
                          tableLineColor: [62, 118, 165],
                          tableLineWidth: 0.5,
                          margin: { horizontal: 10 },
                        });
                        addFooter(doc, appHost);

                        yPosition = doc.lastAutoTable.finalY + 5;

                        const remarksData = serviceData.find(
                          (data) => data.label === "Remarks"
                        );
                        if (remarksData) {
                          const remarks =
                            service.annexureData[remarksData.values.name] ||
                            "No remarks available.";
                          doc.setFont("helvetica", "italic");
                          doc.setFontSize(10);
                          doc.setTextColor(100, 100, 100);
                          doc.text(`Remarks: ${remarks}`, 10, yPosition);
                          yPosition += 7;
                        }

                        const annexureData = service.annexureData || {}; // Ensure annexureData is an empty object if it's null or undefined

                        const annexureImagesKey = Object.keys(
                          annexureData
                        ).find(
                          (key) =>
                            key.toLowerCase().startsWith("annexure") &&
                            !key.includes("[") &&
                            !key.includes("]")
                        );
                        if (annexureImagesKey) {
                          const annexureImagesStr =
                            annexureData[annexureImagesKey];
                          const annexureImagesSplitArr = annexureImagesStr
                            ? annexureImagesStr.split(",")
                            : [];

                          if (annexureImagesSplitArr.length === 0) {
                            doc.setFont("helvetica", "italic");
                            doc.setFontSize(10);
                            doc.setTextColor(150, 150, 150);
                            doc.text(
                              "No annexure images available.",
                              10,
                              yPosition
                            );
                            yPosition += 10;
                          } else {
                            for (const [
                              index,
                              imageUrl,
                            ] of annexureImagesSplitArr.entries()) {
                              const imageUrlFull = imageUrl.trim();
                              const imageFormat = getImageFormat(imageUrlFull);
                              if (!(await checkImageExists(imageUrlFull))) {
                                continue;
                              }

                              const img = await validateImage(imageUrlFull);
                              if (!img) {
                                console.warn(`Invalid image: ${imageUrlFull}`);
                                continue;
                              }

                              try {
                                const { width, height } = scaleImage(
                                  img,
                                  doc.internal.pageSize.width - 20,
                                  80
                                );
                                if (
                                  yPosition + height >
                                  doc.internal.pageSize.height - 20
                                ) {
                                  doc.addPage();
                                  yPosition = 10;
                                }

                                const annexureText = `Annexure ${annexureIndex} (${String.fromCharCode(
                                  97 + index
                                )})`;
                                const textWidth =
                                  doc.getTextWidth(annexureText);
                                const centerX =
                                  (doc.internal.pageSize.width - textWidth) / 2;

                                doc.setFont("helvetica", "bold");
                                doc.setFontSize(10);
                                doc.setTextColor(0, 0, 0);
                                doc.text(annexureText, centerX, yPosition + 10);
                                yPosition += 15;

                                const centerXImage =
                                  (doc.internal.pageSize.width - width) / 2;
                                if (
                                  centerXImage < 0 ||
                                  yPosition < 0 ||
                                  width <= 0 ||
                                  height <= 0
                                ) {
                                  console.error(
                                    "Invalid coordinates or dimensions for image:",
                                    { centerXImage, yPosition, width, height }
                                  );
                                  continue;
                                }

                                doc.addImage(
                                  await fetchImageAsBase64(img.src),
                                  imageFormat,
                                  centerXImage,
                                  yPosition,
                                  width,
                                  height
                                );
                                yPosition += height + 15;
                              } catch (error) {
                                console.error(
                                  `Failed to add image to PDF: ${imageUrlFull}`,
                                  error
                                );
                              }
                            }
                          }
                        } else {
                          doc.setFont("helvetica", "italic");
                          doc.setFontSize(10);
                          doc.setTextColor(150, 150, 150);
                          doc.text(
                            "No annexure images available.",
                            10,
                            yPosition
                          );
                          yPosition += 15;
                        }

                        addFooter(doc, appHost);
                        annexureIndex++;
                        yPosition += 20;
                      }
                      doc.addPage();
                      addFooter(doc, appHost);

                      const disclaimerButtonHeight = 10;
                      const disclaimerButtonWidth =
                        doc.internal.pageSize.width - 20;

                      const buttonBottomPadding = 5;
                      const disclaimerTextTopMargin = 5;

                      const adjustedDisclaimerButtonHeight =
                        disclaimerButtonHeight + buttonBottomPadding;

                      const disclaimerTextPart1 = `This report is confidential and is meant for the exclusive use of the Client. This report has been prepared solely for the purpose set out pursuant to our letter of engagement (LoE)/Agreement signed with you and is not to be used for any other purpose. The Client recognizes that we are not the source of the data gathered and our reports are based on the information purpose. The Client recognizes that we are not the source of the data gathered and our reports are based on the information responsible for employment decisions based on the information provided in this report.`;
                      const anchorText = "";
                      const disclaimerTextPart2 = "";

                      doc.setFont("helvetica", "normal");
                      doc.setFontSize(10);
                      doc.setTextColor(0, 0, 0);
                      const disclaimerLinesPart1 = doc.splitTextToSize(
                        disclaimerTextPart1,
                        disclaimerButtonWidth
                      );
                      const disclaimerLinesPart2 = doc.splitTextToSize(
                        disclaimerTextPart2,
                        disclaimerButtonWidth
                      );
                      const lineHeight = 7;
                      const disclaimerTextHeight =
                        disclaimerLinesPart1.length * lineHeight +
                        disclaimerLinesPart2.length * lineHeight +
                        lineHeight;

                      const totalContentHeight =
                        adjustedDisclaimerButtonHeight +
                        disclaimerTextHeight +
                        disclaimerTextTopMargin;

                      const availableSpace = doc.internal.pageSize.height - 40;

                      let disclaimerY = 20;

                      if (disclaimerY + totalContentHeight > availableSpace) {
                        doc.addPage();
                        addFooter(doc, appHost);
                        disclaimerY = 20;
                      }
                      const disclaimerButtonXPosition =
                        (doc.internal.pageSize.width - disclaimerButtonWidth) /
                        2;

                      if (
                        disclaimerButtonWidth > 0 &&
                        disclaimerButtonHeight > 0 &&
                        !isNaN(disclaimerButtonXPosition) &&
                        !isNaN(disclaimerY)
                      ) {
                        doc.setDrawColor(62, 118, 165);
                        doc.setFillColor(backgroundColor);
                        doc.rect(
                          disclaimerButtonXPosition,
                          disclaimerY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight,
                          "F"
                        );
                        doc.rect(
                          disclaimerButtonXPosition,
                          disclaimerY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight,
                          "D"
                        );
                      } else {
                        console.error(
                          "Invalid rectangle dimensions:",
                          disclaimerButtonXPosition,
                          disclaimerY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight
                        );
                      }
                      doc.setTextColor(0, 0, 0);
                      doc.setFont("helvetica", "bold");

                      const disclaimerButtonTextWidth =
                        doc.getTextWidth("DISCLAIMER");
                      const buttonTextHeight = doc.getFontSize();

                      const disclaimerTextXPosition =
                        disclaimerButtonXPosition +
                        disclaimerButtonWidth / 2 -
                        disclaimerButtonTextWidth / 2 -
                        1;
                      const disclaimerTextYPosition =
                        disclaimerY +
                        disclaimerButtonHeight / 2 +
                        buttonTextHeight / 4 -
                        1;

                      doc.text(
                        "DISCLAIMER",
                        disclaimerTextXPosition,
                        disclaimerTextYPosition
                      );

                      let currentY =
                        disclaimerY +
                        adjustedDisclaimerButtonHeight +
                        disclaimerTextTopMargin;

                      doc.setFont("helvetica", "normal");
                      doc.setTextColor(0, 0, 0);
                      disclaimerLinesPart1.forEach((line) => {
                        doc.text(line, 10, currentY);
                        currentY += lineHeight;
                      });
                      doc.setTextColor(0, 0, 255);
                      doc.textWithLink(
                        anchorText,
                        10 +
                        doc.getTextWidth(
                          disclaimerLinesPart1[
                          disclaimerLinesPart1.length - 1
                          ]
                        ),
                        currentY - lineHeight,
                        {
                          url: "mailto:compliance@goldquestglobal.com",
                        }
                      );
                      doc.setTextColor(0, 0, 0);
                      disclaimerLinesPart2.forEach((line) => {
                        doc.text(line, 10, currentY);
                        currentY += lineHeight;
                      });

                      let endOfDetailY = currentY + disclaimerTextTopMargin - 5;

                      if (
                        endOfDetailY + disclaimerButtonHeight >
                        doc.internal.pageSize.height - 20
                      ) {
                        doc.addPage();
                        endOfDetailY = 20;
                      }

                      const endButtonXPosition =
                        (doc.internal.pageSize.width - disclaimerButtonWidth) /
                        2; // Centering horizontally

                      if (
                        disclaimerButtonWidth > 0 &&
                        disclaimerButtonHeight > 0 &&
                        !isNaN(endButtonXPosition) &&
                        !isNaN(endOfDetailY)
                      ) {
                        doc.setDrawColor(62, 118, 165);
                        doc.setFillColor(backgroundColor);
                        doc.rect(
                          endButtonXPosition,
                          endOfDetailY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight,
                          "F"
                        );
                        doc.rect(
                          endButtonXPosition,
                          endOfDetailY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight,
                          "D"
                        );
                      } else {
                        console.error(
                          "Invalid rectangle dimensions for END OF DETAIL REPORT button:",
                          endButtonXPosition,
                          endOfDetailY,
                          disclaimerButtonWidth,
                          disclaimerButtonHeight
                        );
                      }

                      doc.setTextColor(0, 0, 0);
                      doc.setFont("helvetica", "bold");

                      const endButtonTextWidth = doc.getTextWidth(
                        "END OF DETAIL REPORT"
                      );
                      const endButtonTextHeight = doc.getFontSize();
                      const endButtonTextXPosition =
                        endButtonXPosition +
                        disclaimerButtonWidth / 2 -
                        endButtonTextWidth / 2 -
                        1;
                      const endButtonTextYPosition =
                        endOfDetailY +
                        disclaimerButtonHeight / 2 +
                        endButtonTextHeight / 4 -
                        1;

                      doc.text(
                        "END OF DETAIL REPORT",
                        endButtonTextXPosition,
                        endButtonTextYPosition
                      );

                      const imgPath = path.join(__dirname, '../assets/images/verified.png'); // Resolve absolute path

                      // Check if the image file exists
                      if (fs.existsSync(imgPath)) {
                        try {
                          // Read the image file and convert it to Base64
                          const imageBase64 = fs.readFileSync(imgPath, { encoding: 'base64' });
                          const imgData = `data:image/png;base64,${imageBase64}`;

                          // Calculate the width and height of the image dynamically
                          const imgWidth = 50;
                          const imgHeight = 40;

                          // Calculate the X position to center the image horizontally
                          const centerX = (pageWidth - imgWidth) / 2;
                          const centerY = endOfDetailY + 20; // Place 20 units below "END OF DETAIL REPORT"

                          // Add the image to the PDF
                          doc.addImage(imgData, 'PNG', centerX, centerY, imgWidth, imgHeight);
                        } catch (error) {
                          console.error('Error reading the image file:', error);
                        }
                      } else {
                        console.warn('Image file not found:', imgPath);
                      }

                      addFooter(doc, appHost);
                      const pdfPathCloud = await savePdf(
                        doc,
                        pdfFileName,
                        targetDirectory
                      );
                      // doc.save(pdfPath);
                      resolve(pdfPathCloud);
                    } catch (error) {
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
    });
  },
};
