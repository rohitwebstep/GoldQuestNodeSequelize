const express = require("express");
const cors = require("cors");
const router = express.Router();
const candidateController = require("../../../controllers/customer/branch/candidate/applicationController");
const clientController = require("../../../controllers/customer/branch/client/applicationController");
const cefRoutes = require("./candidate-email-form/cefRoutes.js");
const davRoutes = require("./digital-address-verification/davRoutes.js");

const app = express();
app.use(cors());

// Basic routes
router.post("/create", candidateController.create);
router.post("/convert-to-client", clientController.convertToClient);
router.post("/bulk-create", candidateController.bulkCreate);
router.get("/list", candidateController.list);
router.put("/update", candidateController.update);
router.delete("/delete", candidateController.delete);
router.delete("/", candidateController.delete);

router.get(
  "/gap-check",
  candidateController.gapCheck
);

router.get(
  "/bgv-application-by-id",
  candidateController.cefApplicationByID
);
router.get(
  "/dav-application-by-id",
  candidateController.davApplicationByID
);

router.use("/backgroud-verification", cefRoutes);
router.use("/digital-address-verification", davRoutes);

module.exports = router;
