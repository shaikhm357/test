import express from "express";
import authController from "../controllers/authController";
import { USER_ROLES } from "../models/roleModel";
import downloadDocumentFireController from "../controllers/downloadDocumentFIREController";
import downloadDocumentIARController from "../controllers/downloadDocumentIARController";
import downloadDocumentBLUSController from "../controllers/downloadDocumentBLUSController";
import downloadDocumentLiabilityController from "../controllers/downloadDocumentLiabilityController";
import downloadDocumentLiabilityCGLController from "../controllers/downloadDocumentLiabilityCGLController";
import downloadDocumentLiabilityPLController from "../controllers/downloadDocumentLiabilityPLController";
import downloadDocumentLiabilityENOController from "../controllers/downloadDocumentLiabilityENOController";
import downloadDocumentLiabilityWCController from "../controllers/downloadDocumentLiabilityWCController";
import downloadDocumentGMCController from "../controllers/downloadDocumentGMCController";


// By default each router only has access to url params of their own route.
// using the below we are able to access the parameters defined in the tour router, here also.
export const router = express.Router({ mergeParams: true });

// Adding authentication here, all routes below this are now authenticated.
router.use(authController.protect);

router.route("/FIRE").post(downloadDocumentFireController.downloadDocument);
router.route("/IAR").post(downloadDocumentIARController.downloadDocument);
router.route("/BLUS").post(downloadDocumentBLUSController.downloadDocument);

//Liability
router.route("/LIABILITY_DNO_CRIME").post(downloadDocumentLiabilityController.downloadDocument);
router.route("/LIABILITY_CGL_PUBLIC").post(downloadDocumentLiabilityCGLController.downloadDocument);
router.route("/LIABILITY_PRODUCT_CYBER").post(downloadDocumentLiabilityPLController.downloadDocument);
router.route("/LIABILITY_EANDO").post(downloadDocumentLiabilityENOController.downloadDocument);
router.route("/WORKMENSCOMPENSATION").post(downloadDocumentLiabilityWCController.downloadDocument);

// GMC
router.route("/GMC").post(downloadDocumentGMCController.downloadDocument);





