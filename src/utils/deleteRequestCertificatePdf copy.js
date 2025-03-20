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
} = require("./cloudImageSave");

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

function addFooter(doc) {

  const footerHeight = 15;
  const pageHeight = doc.internal.pageSize.height;
  const footerYPosition = pageHeight - footerHeight + 10;

  const pageWidth = doc.internal.pageSize.width;
  const centerX = pageWidth / 2;

  const pageCount = doc.internal.getNumberOfPages();
  const currentPage = doc.internal.getCurrentPageInfo().pageNumber;
  const pageNumberText = `Page ${currentPage} / ${pageCount}`;

  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.text(pageNumberText, centerX, footerYPosition - 3, { align: 'center' });

}

function addNotesPage(doc) {
  doc.addPage();

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;

  const leftMargin = 10;
  const rightMargin = 10;

  const boxYPosition = 20;
  const boxHeight = 30;
  const boxWidth = pageWidth - leftMargin - rightMargin;

  doc.setLineWidth(0.5);
  doc.rect(leftMargin, boxYPosition, boxWidth, boxHeight);

  const headerText = "SPECIAL NOTES, TERMS AND CONDITIONS";
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(headerText, pageWidth / 2, boxYPosition + 6, { align: 'center' });

  const notesText = `
   Make all your payment Cheques, RTGS/NEFT Payable to: "GOLDQUEST GLOBAL HR SERVICES PRIVATE LIMITED". Payment to be made as per the terms of Agreement. Payments received after the due date shall be liable for interest @ 3% per month, part of month taken as full month. Any discrepancy shall be intimated within 3 working days of receipt of bill. Please email us at accounts@goldquestglobal.com or Contact Us: +91 8754562623.
       `;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.text(notesText, leftMargin + 2, boxYPosition + 8, { maxWidth: boxWidth - 4 });

  // Position "Thank you" text on the left side
  const thankYouText = "[ Thank you for your patronage ]";
  const thankYouXPosition = leftMargin + 5; // Adjust this value to your preference
  const thankYouYPosition = boxYPosition + boxHeight + 20;
  doc.setFont("helvetica", "italic");
  doc.setFontSize(10);
  doc.text(thankYouText, thankYouXPosition, thankYouYPosition);

  // Position signature image on the right side
  const signatureYPosition = thankYouYPosition + 20;
  const signatureImageWidth = 50;
  const signatureImageHeight = 20;
  const signatureXPosition = pageWidth - rightMargin - signatureImageWidth;

  const signatureBase64 = fetchImageAsBase64(
    "https://i0.wp.com/goldquestglobal.in/wp-content/uploads/2024/03/goldquestglobal.png"
  );
  doc.addImage(signatureBase64, 'PNG', signatureXPosition, signatureYPosition - signatureImageHeight, signatureImageWidth, signatureImageHeight);
  addFooter(doc);

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
  deleteRequestCertificatePdf: async (
    deleteResult,
    pdfFileName,
    pdfTargetDirectory
  ) => {
    const doc = new jsPDF();

    // Adding logo image
    const logoImg = await fetchImageAsBase64(
      'https://i0.wp.com/goldquestglobal.in/wp-content/uploads/2024/03/goldquestglobal.png?w=771&ssl=1'
    );
    // Add the image to the PDF
    doc.addImage(logoImg, 'PNG', 10, 10, 40, 20);

    // Text content
    doc.setFontSize(12);
    const rightContent = 'All applications and branch data of this client have been deleted.';
    const pageWidth = doc.internal.pageSize.getWidth();
    const textWidth = doc.getTextWidth(rightContent);
    let textY = 20;
    doc.text(rightContent, pageWidth - textWidth - 10, textY);

    // Title for the document
    const text = 'Below are the applications of the deleted client';
    const xPosition = (pageWidth - textWidth) / 2;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(text, xPosition, textY + 20);

    let currentY = textY + 30; // Starting Y position for tables after title

    deleteResult.data.branches.forEach(branch => {
      console.log(`Branch: ${branch.branchName}`);

      if (branch.clientApplications?.length) {
        // console.log("Client Applications:");
        branch.clientApplications.forEach(app => {
          console.log(`- ${app.name}, ID: ${app.application_id}, Created At: ${app.created_at}`);
        });
      }

      if (branch.candidateApplications?.length) {
        // console.log("Candidate Applications:");
        branch.candidateApplications.forEach(app => {
          console.log(`- ${app.name}, ID: ${app.application_id}, Created At: ${app.created_at}`);
        });
      }
    });
    // Loop through each branch data
    deleteResult.data.branches.forEach(branch => {
      // Draw a full-width border line before branch name
      doc.setLineWidth(0.5);
      doc.line(10, currentY, pageWidth - 10, currentY); // Full-width line
      currentY += 10; // Space between line and branch name

      const text2 = `Branch: ${branch.branchName}`;

      const textWidthNew = doc.getTextWidth(text2);

      const xPositionNew = (pageWidth - textWidthNew) / 2;
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(text2, xPositionNew, currentY);
      currentY += 20; // Adjust Y for next content

      // **Client Applications Heading**
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Client Applications', 14, currentY);
      currentY += 10; // Adjust Y for table content

      if (branch.clientApplications && branch.clientApplications.length > 0) {
        // Create table for Client Applications
        const clientTableData = branch.clientApplications.map((client, sn) => ({
          sn: sn + 1,
          applicationId: client.application_id,
          applicantName: client.name
        }));

        const clientTableColumns = [
          { header: 'S.N.', dataKey: 'sn' },
          { header: 'Application ID', dataKey: 'applicationId' },
          { header: 'Applicant Name', dataKey: 'applicantName' }
        ];

        doc.autoTable({
          head: [clientTableColumns.map(col => col.header)],
          body: clientTableData.map(row => Object.values(row)),
          startY: currentY,
          theme: 'striped',
          margin: { top: 10, bottom: 10 },
          styles: {
            fontSize: 10,
            cellPadding: 3,
            halign: 'center',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontSize: 12,
            fontStyle: 'bold',
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: 50,
            lineWidth: 0.1,
            lineColor: [200, 200, 200],
          },
        });

        currentY = doc.lastAutoTable.finalY + 10; // Update currentY for next section
      } else {
        // If no client applications, show "No applications" with full-width border
        const noAppsText = 'No applications';
        const textWidthNoApps = doc.getTextWidth(noAppsText);

        // Draw the full-width box
        const boxX = 10;
        const boxY = currentY - 4;
        const boxWidth = pageWidth - 20; // Full width of the page (with padding on both sides)
        const boxHeight = 8;

        doc.setDrawColor(0, 0, 0); // Black border
        doc.rect(boxX, boxY, boxWidth, boxHeight); // Draw the rectangle around text

        // Show the "No applications" text inside the box, centered
        const xPosNoApps = (pageWidth - textWidthNoApps) / 2;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(noAppsText, xPosNoApps, currentY);

        currentY += boxHeight + 10; // Adjust Y for next section
      }

      // **Candidate Applications Heading**
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Candidate Applications', 14, currentY);
      currentY += 10; // Adjust Y for table content

      if (branch.candidateApplications && branch.candidateApplications.length > 0) {
        // Create table for Candidate Applications
        const candidateTableData = branch.candidateApplications.map((candidate, sn) => ({
          sn: sn + 1,
          applicationId: candidate.application_id,
          applicantName: candidate.name
        }));

        const candidateTableColumns = [
          { header: 'S.N.', dataKey: 'sn' },
          { header: 'Application ID', dataKey: 'applicationId' },
          { header: 'Applicant Name', dataKey: 'applicantName' }
        ];

        doc.autoTable({
          head: [candidateTableColumns.map(col => col.header)],
          body: candidateTableData.map(row => Object.values(row)),
          startY: currentY,
          theme: 'striped',
          margin: { top: 10, bottom: 10 },
          styles: {
            fontSize: 10,
            cellPadding: 3,
            halign: 'center',
            valign: 'middle',
          },
          headStyles: {
            fillColor: [41, 128, 185],
            textColor: 255,
            fontSize: 12,
            fontStyle: 'bold',
          },
          bodyStyles: {
            fillColor: [255, 255, 255],
            textColor: 50,
            lineWidth: 0.1,
            lineColor: [200, 200, 200],
          },
        });

        currentY = doc.lastAutoTable.finalY + 10; // Update currentY for next section
      } else {
        // If no candidate applications, show "No applications"
        const noAppsText = 'No applications';
        const textWidthNoApps = doc.getTextWidth(noAppsText);

        // Draw the full-width box
        const boxX = 10;
        const boxY = currentY - 4;
        const boxWidth = pageWidth - 20; // Full width of the page (with padding on both sides)
        const boxHeight = 8;

        doc.setDrawColor(0, 0, 0); // Black border
        doc.rect(boxX, boxY, boxWidth, boxHeight); // Draw the rectangle around text

        // Show the "No applications" text inside the box, centered
        const xPosNoApps = (pageWidth - textWidthNoApps) / 2;
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(noAppsText, xPosNoApps, currentY);

        currentY += boxHeight + 10; // Adjust Y for next section
      }
    });

    // Optional: Add footer if needed
    addFooter(doc);

    addNotesPage(doc);

    addFooter(doc);

    doc.save('Client.pdf');
  },
};
