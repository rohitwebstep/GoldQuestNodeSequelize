const fs = require("fs");
const path = require("path");
const Test = require("../models/testModel");
const axios = require("axios");
const sharp = require("sharp");
const { upload, saveImage, saveImages, deleteFolder } = require("../utils/cloudImageSave");

exports.deleteFolder = async (req, res) => {
  try {
    const deleteResponse = await deleteFolder("/uploads/customers/GQ-TEST");
    res.json({ success: true, message: "Folder deleted successfully", data: deleteResponse });
  } catch (error) {
    res.status(500).json({ success: false, message: "Failed to delete folder", error: error.message });
  }
};


exports.uploadImage = (req, res) => {
  // Define the target directory to move files to
  const targetDir = "uploads/rohit"; // Specify your target directory here
  fs.mkdir(targetDir, { recursive: true }, (err) => {
    if (err) {
      console.error("Error creating directory:", err);
      return res.status(500).json({
        status: false,
        message: "Error creating directory.",
      });
    }
    // Use multer to handle the upload
    upload(req, res, async (err) => {
      if (err) {
        return res.status(400).json({
          status: false,
          message: "Error uploading file.",
        });
      }

      try {
        let savedImagePaths = [];

        // Check if multiple files are uploaded under the "images" field
        if (req.files.images) {
          savedImagePaths = await saveImages(req.files.images, targetDir); // Pass targetDir to saveImages
        }

        // Check if a single file is uploaded under the "image" field
        if (req.files.image && req.files.image.length > 0) {
          const savedImagePath = await saveImage(req.files.image[0], targetDir); // Pass targetDir to saveImage
          savedImagePaths.push(savedImagePath);
        }

        // Return success response
        return res.status(201).json({
          status: true,
          message:
            savedImagePaths.length > 0
              ? "Image(s) saved successfully"
              : "No images uploaded",
          data: savedImagePaths,
        });
      } catch (error) {
        console.error("Error saving image:", error);
        return res.status(500).json({
          status: false,
          message: "An error occurred while saving the image",
        });
      }
    });
  });
};

exports.connectionCheck = (req, res) => {
  console.log("Step 1: Entering connectionCheck function.");

  // Get the IP address from the X-Forwarded-For header or req.ip
  let ipAddress =
    req.headers["x-forwarded-for"] || req.connection.remoteAddress;
  console.log("Step 2: Initial IP address extracted:", ipAddress);

  // If there are multiple IPs in X-Forwarded-For, take the first one (the real client's IP)
  if (ipAddress.includes(",")) {
    ipAddress = ipAddress.split(",")[0].trim(); // Take the first IP in the list
    console.log(
      "Step 3: Multiple IPs detected, using the first IP:",
      ipAddress
    );
  }

  // If the IP address is IPv6-mapped IPv4 (::ffff:), extract the real IPv4 address
  if (ipAddress.startsWith("::ffff:")) {
    ipAddress = ipAddress.slice(7); // Remove "::ffff:" to get the correct IPv4 address
    console.log(
      "Step 4: IPv6-mapped IPv4 detected, converted to IPv4:",
      ipAddress
    );
  }

  ipAddress = ipAddress.trim();
  console.log("Step 5: Final cleaned IP address:", ipAddress);

  // Database check function
  console.log("Step 6: Initiating database check with Test.connectionCheck.");
  Test.connectionCheck((err, result) => {
    if (err) {
      console.error("Step 7: Database error occurred:", err);
      return res.status(500).json({
        status: false,
        message: err.message,
      });
    }

    console.log("Step 8: Database check completed. Result:", result);

    if (!result) {
      console.log("Step 9: No matching customers found.");
      return res.json({
        status: true,
        message: "No matching customers found",
        ipAddress,
      });
    }

    console.log("Step 10: Customers fetched successfully.");
    res.json({
      status: true,
      message: "Customers fetched successfully",
      ipAddress,
    });
  });
};

exports.imageUrlToBase = async (req, res) => {
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

  async function fetchImageAsBase64(imageUrl) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
      });
      return `data:image/png;base64,${Buffer.from(
        response.data,
        "binary"
      ).toString("base64")}`;
    } catch (error) {
      console.error("Error fetching or converting image:", error.message);
      return null;
    }
  }

  // Expecting a comma-separated string of image URLs in req.body.image_urls
  const { image_urls } = req.body;

  if (!image_urls) {
    return res.status(400).send("Missing image URLs");
  }

  // Split the comma-separated string into an array of image URLs
  const imageUrlsArray = Array.isArray(image_urls)
    ? image_urls.map(url => url.trim())
    : image_urls.split(",").map(url => url.trim());

  const base64Images = [];

  for (const imageUrl of imageUrlsArray) {
    const imageFormat = getImageFormat(imageUrl);

    if (!(await checkImageExists(imageUrl))) {
      continue;
    }

    const img = await validateImage(imageUrl);
    if (!img) {
      console.log(`img - `, img);
      console.warn(`Invalid image: ${imageUrl}`);
      continue;
    }

    const base64Image = await fetchImageAsBase64(img.src);
    if (!base64Image) {
      console.error("Failed to convert image to base64:", imageUrl);
      continue;
    }

    // Add image format, width, and height to the response
    base64Images.push({
      imageUrl: img.src,
      base64: base64Image,
      type: img.format, // Image format (e.g., PNG, JPEG)
      width: img.width, // Image width
      height: img.height, // Image height
    });
  }

  res.status(200).json({ images: base64Images });
};