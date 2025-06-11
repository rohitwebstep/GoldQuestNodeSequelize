const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const Test = require("../models/testModel");
const axios = require("axios");
const sharp = require("sharp");
const { upload, saveImage, saveImages, deleteFolder } = require("../utils/cloudImageSave");
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

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

exports.uploadImageByUrl = async (req, res) => {
  const { imageUrl, imageUrls } = req.body; // Accept single or multiple URLs
  const targetDir = "uploads/by-url";

  try {
    await fs.promises.mkdir(targetDir, { recursive: true });

    let downloadedFiles = [];

    const downloadImage = async (url) => {
      const extension = path.extname(url.split("?")[0]) || ".jpg";
      const filename = `${Date.now()}_${uuidv4()}${extension}`;
      const filepath = path.join("uploads", filename);

      const response = await axios({
        method: "GET",
        url,
        responseType: "stream",
      });

      const writer = fs.createWriteStream(filepath);
      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on("finish", () => {
          resolve({
            filename: filename,
            originalname: path.basename(url),
            mimetype: response.headers["content-type"] || "image/jpeg",
            path: filepath,
          });
        });
        writer.on("error", reject);
      });
    };

    if (imageUrls && Array.isArray(imageUrls)) {
      for (const url of imageUrls) {
        const file = await downloadImage(url);
        downloadedFiles.push(file);
      }
    } else if (imageUrl) {
      const file = await downloadImage(imageUrl);
      downloadedFiles.push(file);
    } else {
      return res.status(400).json({
        status: false,
        message: "No imageUrl or imageUrls provided",
      });
    }

    // Now save to FTP using your existing saveImage/saveImages logic
    let savedPaths = [];

    if (downloadedFiles.length > 1) {
      savedPaths = await saveImages(downloadedFiles, targetDir);
    } else {
      const savedPath = await saveImage(downloadedFiles[0], targetDir);
      savedPaths.push(savedPath);
    }

    return res.status(201).json({
      status: true,
      message: "Image(s) uploaded to FTP successfully",
      data: savedPaths,
    });
  } catch (err) {
    console.error("Error processing images:", err);
    return res.status(500).json({
      status: false,
      message: "Error uploading images",
    });
  }
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
  Test.testCheck((err, result) => {
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
      result
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


exports.nearestLocationsByCoordinates = async (req, res) => {
  // Extract client IP and domain
  const clientIp = req.ip || req.connection.remoteAddress;
  const forwardedFor = req.get('X-Forwarded-For');
  const origin = req.get('Origin') || req.get('Referer') || 'Unknown';

  const clientInfo = {
    ip: forwardedFor ? forwardedFor.split(',')[0].trim() : clientIp,
    domain: origin,
  };

  console.log(`📍 Request from IP: ${clientInfo.ip}, Domain: ${clientInfo.domain}`);

  // Extract and validate query parameters
  const { latitude, longitude, locations, radius } = req.body;

  if (!latitude || !longitude || !locations) {
    return res.status(400).json({
      status: 'error',
      message: 'Missing required parameters: latitude, longitude, and locations.',
      client: clientInfo,
    });
  }

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  const types = locations.split(',').map(type => type.trim());

  const results = {};

  try {
    for (const type of types) {
      const googleUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`;
      const params = {
        location: `${lat},${lng}`,
        radius,
        type,
        key: GOOGLE_API_KEY,
      };

      const response = await axios.get(googleUrl, { params });

      if (response.data.status === 'OK' && response.data.results.length > 0) {
        const nearest = response.data.results[0]; // pick only the nearest one
        results[type] = {
          name: nearest.name,
          address: nearest.vicinity,
          rating: nearest.rating || 'N/A',
          coordinates: {
            latitude: nearest.geometry.location.lat,
            longitude: nearest.geometry.location.lng,
          },
        };
      } else {
        console.warn(`Google Places API returned '${response.data.status}' or no results for type: ${type}`);
        results[type] = null;
      }
    }

    return res.json({
      status: 'success',
      data: results,
      client: clientInfo,
    });

  } catch (error) {
    console.error('Google API error:', error.message);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to fetch data from Google Places API.',
      error: error.message,
      client: clientInfo,
    });
  }
};
