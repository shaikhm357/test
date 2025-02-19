import { Request, Response, NextFunction } from "../overrides";
import { QuoteSlip } from "../models/quoteSlipModel";
import { AppError } from "../utils/appError";
import { catchAsync } from "../utils/catchAsync";
import { QuoteLocationOccupancy } from "../models/quoteLocationOccupancyModel";
// @ts-ignore
import { logger } from "../winston";
import { _BSC_TYPES } from '../models/bscCoverModel';
import fs from "fs";
import path from "path";
import { QUOTE_STATUS_FROM_DB_TO_NEW_NAME, requestAsyncLocalStorageCtxt } from "../models/common";
import { AllowedQuoteStates, IQuoteOption, QuoteOption } from "../models/quoteOptionModel";
import { ClaimExperience } from "../models/claimExperienceModel";
import { TermsConditions } from "../models/termsConditionsModel";
import { ExpiredDetails } from "../models/expiredDetailsModel";
import { ExcessDeductiblesModel } from "../models/excessDeductiblesModel";
import { ProjectDetailsModel } from "../models/projectsMasterModel";
import { InstallmentsModel } from "../models/installmentsMasterModel";
import { QuoteLocationAddonCovers } from "../models/quoteLocationAddonCoversModel";
import { IQuoteGmcTemplate, QuoteGmcTemplate } from "../models/quoteGmcTemplateModel";
const puppeteer = require("puppeteer");
const handlebars = require("handlebars");
const { exec } = require('child_process');

type Item = {
    name: string;
    value: string;
};

type SubSection = {
    title: string;
    items: Item[];
};

type Section = {
    section_title: string;
    sub_sections: SubSection[];
};

type Peril = {
    name: string;
    status: string;
};

type LocationAndOccupancy = {
    location_address: string;
    occupancy: string;
    flexa_rsmd: string;
    rsmd_value: string;
    stfi: string;
    stfi_value: string;
    earthquake: string;
    earthquake_value: string;
    terrorism: string;
    terrorism_value: string;
    total_sum_insured: string;
    base_premium: string;
};

type Clause = {
    name: string;
    sum_insured: string;
};

type ConvertedData = {
    multiple_occupancies: {
        location_and_occupancy: LocationAndOccupancy[];
    }[];
};

const AllowedProductBscCover = {
    FLOATER_COVER_ADD_ON: 'FLOATER_COVER_ADD_ON',
    DECLARATION_POLICY: 'DECLARATION_POLICY',
    LOSE_OF_RENT: 'LOSE_OF_RENT',
    RENT_FOR_ALTERNATIVE_ACCOMODATION: 'RENT_FOR_ALTERNATIVE_ACCOMODATION',
    PERSONAL_ACCIDENT_COVER: 'PERSONAL_ACCIDENT_COVER',
    VALUABLE_CONTENTS_ON_AGREED_VALUE_BASIS: 'VALUABLE_CONTENTS_ON_AGREED_VALUE_BASIS',

    BSC_FIRE_LOSS_OF_PROFIT_COVER: 'BSC_FIRE_LOSS_OF_PROFIT_COVER',
    BSC_BURGLARY_HOUSEBREAKING_COVER: 'BSC_BURGLARY_HOUSEBREAKING_COVER',
    BSC_MONEY_SAFE_TILL_COVER: 'BSC_MONEY_SAFE_TILL_COVER',
    BSC_MONEY_TRANSIT_COVER: 'BSC_MONEY_TRANSIT_COVER',
    BSC_ELECTRONIC_EQUIPMENTS_COVER: 'BSC_ELECTRONIC_EQUIPMENTS_COVER',
    BSC_PORTABLE_EQUIPMENTS_COVER: 'BSC_PORTABLE_EQUIPMENTS_COVER',
    BSC_FIXED_PLATE_GLASS_COVER: 'BSC_FIXED_PLATE_GLASS_COVER',
    BSC_ACCOMPANIED_BAGGAGE_COVER: 'BSC_ACCOMPANIED_BAGGAGE_COVER',
    BSC_FIDELITY_GUARANTEE_COVER: 'BSC_FIDELITY_GUARANTEE_COVER',
    BSC_SIGNAGE_COVER: "BSC_SIGNAGE_COVER",
    BSC_LIABILITY_SECTION_COVER: 'BSC_LIABILITY_SECTION_COVER',
    BSC_WORKMEN_COMPENSATION_COVER: 'BSC_WORKMEN_COMPENSATION_COVER',
    BSC_PEDAL_CYCLE_COVER: 'BSC_PEDAL_CYCLE_COVER',
    BSC_ALL_RISK_COVER: 'BSC_ALL_RISK_COVER',
    THIRD_PARTY_LIABILITY: 'THIRD_PARTY_LIABILITY',
    TENANTS_LEGAL_LIABILITY: 'TENANTS_LEGAL_LIABILITY',
    REMOVAL_OF_DEBRIS: 'REMOVAL_OF_DEBRIS',
    PROTECTION_AND_PRESERVATION_OF_PROPERTY: 'PROTECTION_AND_PRESERVATION_OF_PROPERTY',
    LANDSCAPING_INCLUDING_LAWNS_PLANT_SHRUBS_OR_TREES: 'LANDSCAPING_INCLUDING_LAWNS_PLANT_SHRUBS_OR_TREES',
    KEYS_AND_LOCKS: 'KEYS_AND_LOCKS',
    COVER_OF_VALUABLE_CONTENTS: 'COVER_OF_VALUABLE_CONTENTS',
    CLAIM_PREPARATION_COST: 'CLAIM_PREPARATION_COST',
    ACCIDENTAL_DAMAGE: 'ACCIDENTAL_DAMAGE',
    ADDITIONAL_CUSTOM_DUTY: 'ADDITIONAL_CUSTOM_DUTY',
    DETERIORATION_OF_STOCKS_IN_B: 'DETERIORATION_OF_STOCKS_IN_B',
    DETERIORATION_OF_STOCKS_IN_A: 'DETERIORATION_OF_STOCKS_IN_A',
    ESCALATION: 'ESCALATION',
    EMI_PROTECTION_COVER: 'EMI_PROTECTION_COVER',
    INSURANCE_OF_ADDITIONAL_EXPENSE: 'INSURANCE_OF_ADDITIONAL_EXPENSE',
    INVOLUNTARY_BETTERMENT: 'INVOLUNTARY_BETTERMENT',
}

async function commonQuoteOptionDATA(quote, quoteOptions): Promise<any> {
    const ExpiredDetailsFromDB = await ExpiredDetails({ skipTenant: true }).findOne({ quoteOptionId: quoteOptions?._id });
    const isExpiringAllowedToShow = ['existing'].includes(quote?.quoteType) || false;
    const projectDetailsFromDB = await ProjectDetailsModel({ skipTenant: true }).findOne({ quoteOptionId: quoteOptions?._id });

    // ----------------------- deductibles -----------------------
    const deductiblesFromDB = await ExcessDeductiblesModel({ skipTenant: true }).find({ quoteOptionId: quoteOptions?._id });
    const section_deductibles = {
        title: "Deductibles/Excess",
        expired: []
    };

    let isClaimAmountHeaderAdded = false;
    deductiblesFromDB?.forEach((deductible) => {
        if (!isClaimAmountHeaderAdded && deductible) {
            section_deductibles.expired.push({
                location_wise_sum_insured_pd_bi: "Location wise Sum Insured(PD+BI)",
                claim_percentage: `5 % of claim amt subject to a min. of:`,
            });
            isClaimAmountHeaderAdded = true;
        }

        if (deductible?.deductibles?.length > 0) {
            deductible.deductibles.forEach((deductibleItem) => {
                section_deductibles.expired.push({
                    location_wise_sum_insured_pd_bi: deductibleItem?.text?.trim() || "N/A",
                    claim_percentage: `${deductibleItem?.percentage || 0} % of claim amt subject to a min. of: INR ${deductibleItem?.minAmount?.toString().trim() || "0"}`,
                });
            });
        }
    });

    // ----------------------- installment -----------------------
    const isProjectDetailsAllowedToShow = ['CAR', 'EAR'].includes(quote?.productId?.['shortName']) || false;
    const installmentFromDB = await InstallmentsModel({ skipTenant: true }).findOne({ quoteOptionId: quoteOptions?._id });
    const installmentObj = {
        title: "Installment",
        isInstallmentScheduled: installmentFromDB?.isInstallmentScheduled,
        isProjectDetailsAllowedToShow: isProjectDetailsAllowedToShow,
        numberOfInstallments: installmentFromDB?.numberOfInstallments,
        installments: []
    };
    let installmentHeaderAdded = false;
    installmentFromDB?.installments?.forEach((data) => {
        if (!installmentHeaderAdded) {
            // Push the special object once if claimAmountHeader exists
            installmentObj.installments.push({
                installmentNumber: "Installment Number",
                installmentDate: "Installment Date",
                installmentAmount: "Premium Excluding GST",
            });
            installmentHeaderAdded = true; // Mark as added
        }

        // For all installments (including the first), we always push a normal object
        installmentObj.installments.push({
            installmentNumber: data?.installmentNumber,
            installmentDate: formatDate(data?.installmentDate),
            installmentAmount: data?.installmentAmount,
        });
    });
    // -----------------------------------------------------------

    // ----------------------- quoteLocationAddonCovers -----------------------
    const quoteLocationAddonCoversPropertyDB = await QuoteLocationAddonCovers({ skipTenant: true }).find({ quoteOptionId: quoteOptions?._id }).populate('addOnCoverId');
    const quoteLocationAddonCoversProperty = {
        titleOfProperty: "Covers | Property Damage",
        titleOfBusiness: "Covers | Business Interruption",
        quoteLocationAddonCoverProperty: [],
        quoteLocationAddonCoverBusiness: [],
    };
    quoteLocationAddonCoversPropertyDB?.forEach((data) => {
        if (data?.addOnCoverId?.['category'] === "Property Damage") {
            quoteLocationAddonCoversProperty.quoteLocationAddonCoverProperty.push({
                name: data?.addOnCoverId?.['name'],
                description: data?.addOnCoverId?.['description'],
            });
        }

        if (data?.addOnCoverId?.['category'] === "Business Interruption") {
            quoteLocationAddonCoversProperty.quoteLocationAddonCoverBusiness.push({
                name: data?.addOnCoverId?.['name'],
                description: data?.addOnCoverId?.['description'],
            });
        }

    });
    // -----------------------------------------------------------
    return {
        declarationDropdown: {
            title: "Declaration",
            value: quoteOptions?.declarationDropdown || "Not Selected"
        },
        expired_details: {
            isExpiringAllowedToShow: isExpiringAllowedToShow,
            title: "Expired Details",
            expired: [
                { name: "Expiring Insurance Name", value: ExpiredDetailsFromDB?.expiringIsurenceName || 'NA' },
                { name: "Expiring Insurance Office", value: ExpiredDetailsFromDB?.expiringIsurenceOffice || 'NA' },
                { name: "Expiring Policy Number", value: ExpiredDetailsFromDB?.expiringPolicyNumber || 'NA' },
                { name: "Expiring Policy Period", value: ExpiredDetailsFromDB?.expiringPolicyPeriod || 'NA' }
            ],
        },
        deductibles: section_deductibles,
        project_details: {
            title: "Project Details",
            isProjectDetailsAllowedToShow: isProjectDetailsAllowedToShow,
            pro_details: [
                { name: "Name the Principal", value: projectDetailsFromDB?.principalName },
                { name: "Address of the Principal", value: projectDetailsFromDB?.principalAddress },
                { name: "Name of the Contractors", value: projectDetailsFromDB?.contractorName },
                { name: "Address of the Contractors", value: projectDetailsFromDB?.contractorAddress },
                { name: "Name of Sub Contractors", value: projectDetailsFromDB?.subContractorName },
                { name: "Address of Sub Contractors", value: projectDetailsFromDB?.subContractorAddress },
                { name: "Name of Project", value: projectDetailsFromDB?.nameofProject },
                { name: "Project Description", value: projectDetailsFromDB?.projectDescription },
                { name: "Project Location", value: projectDetailsFromDB?.projectLocation },
                { name: "Project Period Start Date", value: projectDetailsFromDB?.projectPeriodStart },
                { name: "Project Period End Date", value: projectDetailsFromDB?.projectPeriodEnd },
                { name: "Testing Period (if any)", value: projectDetailsFromDB?.testingPeriod },
                { name: "WET risk involved", value: projectDetailsFromDB?.wetRiskInvolved ? "Yes" : "No" },
                { name: "Brownfield Project", value: projectDetailsFromDB?.isbrownfieldProject ? "Yes" : "No" },
            ],
        },
        installmentObj: installmentObj,
        quoteLocationAddonCoversProperty: quoteLocationAddonCoversProperty,
    }
}

async function multiple_occupancies_map_data(inputData: any[]): Promise<ConvertedData> {
    return {
        multiple_occupancies: inputData.map(item => ({
            location_and_occupancy: [
                {
                    location_address: item.address,
                    occupancy: item.occupancy,
                    flexa_rsmd: item.locationDetailHeaders[0],
                    rsmd_value: `₹ ${item.locationDetail[0]}`,
                    stfi: item.locationDetailHeaders[1],
                    stfi_value: `₹ ${item.locationDetail[1]}`,
                    earthquake: item.locationDetailHeaders[2],
                    earthquake_value: `₹ ${item.locationDetail[2]}`,
                    terrorism: item.locationDetailHeaders[3],
                    terrorism_value: `₹ ${item.locationDetail[3]}`,
                    total_sum_insured: `₹ ${item.totalSumAssured.toLocaleString()}`,
                    base_premium: `₹ ${item.premium.toLocaleString()}`,
                },
            ],
        }))
    };
}

function getTreeFromFlatArray(flatArray) {
    const delimiter = "::>::";

    const treeArrayFromFlatArray: any = [];

    for (const key in flatArray) {
        const keys = key.split(delimiter);
        let currentNode = treeArrayFromFlatArray;
        for (let i = 0; i < keys.length; i++) {
            let found = false;
            for (let j = 0; j < currentNode.length; j++) {
                if (currentNode[j].data.key === keys[i]) {
                    currentNode = currentNode[j].children;
                    found = true;
                    break;
                }
            }
            if (!found) {
                let newNode = {};
                if (i === keys.length - 1) {
                    newNode = {
                        data: {
                            "key": keys[i],
                            ...flatArray[key]
                        },
                        leaf: true,
                        // expanded: false,
                        // children: []
                    };
                } else {
                    newNode = {
                        data: {
                            "key": keys[i]
                        },
                        expanded: true,
                        leaf: false,
                        children: []
                    };
                }
                currentNode.push(newNode);
                currentNode = newNode['children'];
            }
        }
    }
    return treeArrayFromFlatArray
}

function formatDate(dateInput?: string | Date): string {
    // If the input is undefined or null, return "-"
    if (!dateInput) {
        return "-";
    }

    // If the input is a string, try to parse it into a Date object
    let date: Date;
    if (typeof dateInput === 'string') {
        date = new Date(dateInput);
    } else {
        // If the input is already a Date object, use it directly
        date = dateInput;
    }

    // Check if the parsed date is valid
    if (isNaN(date.getTime())) {
        return "-"; // Return "-" if the date is invalid
    }

    // Array of month names
    const monthNames = [
        "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
    ];

    // Get day, month, and year
    const day = date.getDate();
    const month = monthNames[date.getMonth()];
    const year = date.getFullYear();

    // Return formatted string
    return `${month} ${day}, ${year}`;
}

const formatCurrency = (amount) => {
    if (!amount) return "₹ 0";
    return `₹ ${amount.toLocaleString('en-IN')}`;
};

const mapDataToHtmlFormat = (calculateCoverDataResult, calculateCoverTotalResult, quote) => {
    const isAllowedToShow = !['Draft', 'Pending Requisition For Quote', 'Sent To Insurance Company RM', 'Under Writer Review'].includes(quote?.quoteState);
    // Map the data to the desired structure
    const suminsured = {
        title: "Sum Insured and Premium Details",
        isAllowedToShow: isAllowedToShow,
        net_premium: formatCurrency(calculateCoverTotalResult?.netPremium),
        gst: formatCurrency(calculateCoverTotalResult?.gst),
        total_premium: formatCurrency(calculateCoverTotalResult?.totalPremium),
        sections: calculateCoverDataResult.map(item => ({
            section: item.sectionOrCover,
            sum_insured: formatCurrency(item.sumInsured),
            isAllowedToShow: isAllowedToShow
        }))
    };

    return suminsured;
};

function transformClaimExperience(claimExperienceArrFromDB) {
    // Initialize arrays for each data point
    const years = [];
    const premiumPaid = [];
    const claimAmount = [];
    const noOfClaims = [];
    const natureOfClaim = [];

    // Loop through claimExperienceArrFromDB and transform data
    claimExperienceArrFromDB.forEach((data, index) => {
        // Get the year range (current year and next year)
        const year = data.year;
        const previousYear = year - 1;
        years.push(`${previousYear} - ${year}`);

        // Add premium paid (format as ₹)
        premiumPaid.push(data.premiumPaid ? `₹ ${data.premiumPaid}` : '₹ 0');

        // Add claim amount (format as ₹)
        claimAmount.push(data.claimAmount ? `₹ ${data.claimAmount}` : '₹ 0');

        // Add number of claims (default to "0" if not present)
        noOfClaims.push(data.numberOfClaims ? data.numberOfClaims.toString() : '0');

        // Add nature of claim (default to "N/A" if not present)
        natureOfClaim.push(data.natureOfClaim || 'N/A');
    });

    // Return the final object structure
    return {
        claim_experience: {
            title: "Claim Experience",
            years,
            premium_paid: premiumPaid,
            claim_amount: claimAmount,
            no_of_claims: noOfClaims,
            nature_of_claim: natureOfClaim
        }
    };
}

async function transformTermsAndConditions(
    termsAndConditionsFromDB: any[]
): Promise<any> {
    // Group terms by the 'section' field
    const groupedTerms: { [section: string]: any[] } = termsAndConditionsFromDB.reduce(
        (acc, item) => {
            if (!acc[item.section]) {
                acc[item.section] = [];
            }
            acc[item.section].push(item);
            return acc;
        },
        {} as { [section: string]: any[] }
    );

    // Transform the grouped terms into the desired format
    const result: any = {
        terms_and_condition: Object.keys(groupedTerms).map((section) => ({
            headline: section, // 'section' is used as the headline
            sections: groupedTerms[section].map((item) => ({
                type: item.type, // 'type' from the DB entry
                description: item.description, // 'description' from the DB entry
            })),
        })),
    };

    return result;
}

const getAllOptionsByQuoteId = async (quoteId: any) => {
    const quoteOptions: IQuoteGmcTemplate[] = [];
    const quote = await QuoteSlip({ skipTenant: true }).findById(quoteId).populate({ path: "productId clientId" });

    if (!quote) {
        logger.error(`No quote found with that ID - ${quoteId}. 404`);
        new AppError(`No quote found with that ID`, 404);
    }

    let allQuoteOption = await QuoteGmcTemplate({ skipTenant: true }).find({ quoteId: quote.id }).populate({ path: "quoteId productId clientId" });

    for (let i = 0; i < allQuoteOption.length; i++) {
        let quoteOptionId = allQuoteOption[i]._id;
        let quoteOption = await getQuoteOptionsById(quoteOptionId);
        quoteOption['fetchClaimExperiencesPrimeResult'] = await ClaimExperience({ skipTenant: true }).find({ quoteOptionId: quoteOptionId }).sort({ year: 1 });;
        quoteOptions.push(quoteOption);
    }
    // ----------------------- DATA prepartion for options -----------------------
    const optionsContainerArr = [];
    for (let idx = 0; idx < quoteOptions.length; idx++) {

        // const calculateCoverDataResult = await calculateCoverData(quoteOptions[idx], quote);
        // const multiple_occupancies_map_data_result = await multiple_occupancies_map_data(calculateCoverDataResult?.addressDataFunctionresult?.addressData)
        // const commonQuoteOptionDataResult = await commonQuoteOptionDATA(quote, quoteOptions[idx])
        // const claimExperienceArrFromDB = quoteOptions[idx]?.['fetchClaimExperiencesPrimeResult']
        // const transformClaimExperienceResult = transformClaimExperience(claimExperienceArrFromDB)

        const optionsContainerObj = {
            "option_name": quoteOptions[idx]?.optionName,
            "number_of_locations": quoteOptions[idx]?.['allCoversArray']?.quoteLocationOccupancies?.length || "-",
            "suminsured": {

                "sections": [
                    {
                        "section": "Section 1",
                        "sum_insured": "100000"
                    },
                    {
                        "section": "Section 2",
                        "sum_insured": "200000"
                    },
                    {
                        "section": "Section 3",
                        "sum_insured": "150000"
                    }
                ]

            }
            // "commonQuoteOptionDataResult": commonQuoteOptionDataResult,
            // "multiple_occupancies": multiple_occupancies_map_data_result?.multiple_occupancies,
            // "claim_experience": transformClaimExperienceResult?.claim_experience
        }
        optionsContainerArr.push(optionsContainerObj)
    }
    // ----------------- for quote_details -----------------
    let hypothicationResult = "-";
    if (quote) {
        if (quote?.hypothications.length > 0) {
            hypothicationResult = quote?.hypothications?.map(item => item.name).join(', ');
        } else {
            hypothicationResult = 'N/A';
        }
    }

    let monthoryears = "";
    if (quote?.productId['renewalPolicyPeriodinMonthsoryears'] == "Y") {
        monthoryears = String(Number(quote?.renewalPolicyPeriod?.split(" ")[0]) / 12) + ' Years';
    } else {
        monthoryears = quote?.renewalPolicyPeriod
    }
    const currentUser = requestAsyncLocalStorageCtxt.getStore()?.currentUser;
    const termsAndConditionsFromDB = await TermsConditions({ skipTenant: true }).find({ partnerId: currentUser["partnerId"]._id, productId: quote?.productId['_id'] }).populate('productId partnerId');

    // Transform the data
    const transformTermsAndConditionsResult = await transformTermsAndConditions(termsAndConditionsFromDB);
    // ----------------- final dataBindingForDoc to pass in HTML -----------------
    const dataBindingForDoc = {
        "headline": {
            "text": QUOTE_STATUS_FROM_DB_TO_NEW_NAME[quote?.quoteState] || 'Placement Slip',
            "product": quote?.productId?.['type'],
        },
        "logo_product__container": {
            "logo": {
                "src": "https://www.alwrite.com/wp-content/uploads/2021/01/alwrite_logo_v3.png",
                "alt": "alwrite-logo"
            }
        },
        "quote_details": {
            "quote_no": quote?.['quoteNo'],
            "policy_type": quote?.['quoteType'],
            "imd": quote?.['originalIntermediateName'],
            "proposer_name": quote?.['clientId']?.['name'],
            "policy_inception_date": formatDate(quote?.['riskStartDate']),
            "policy_period": monthoryears && `${monthoryears} from the Inception Date` || "-",
            "hypothecation": hypothicationResult || "",
            "correspondence_address": quote?.['clientAddress'],
            "quotation_issued": formatDate(quote?.['createdAt']),
            "branch_name": "-" // It will be this way—only for now, at least.
        },
        "options_container": optionsContainerArr,
        "terms_and_condition": transformTermsAndConditionsResult?.terms_and_condition,
        "note": {
            "text": "Quotation is valid for 15 days from the date of quotation"
        }
    }

    return dataBindingForDoc;
}

const getQuoteOptionsById = async (quoteOptionId: any) => {
    const currentUser = requestAsyncLocalStorageCtxt.getStore()?.currentUser;
    const populate = [{
        path: "quoteId",
        populate: {
            path: "productId"
        }
    }];

    let quoteOption = await QuoteGmcTemplate({ skipTenant: true }).findById(quoteOptionId).populate(populate);

    // Recomputes Premium and add additional attributes to quote
    // quoteOption = await quoteOption.recomputePremium();

    // Extracts quote object so we can append new objects into it
    let quoteOptionDocument = quoteOption.toObject();

    if (!quoteOptionDocument["locationBasedCovers"]) {
        const quoteLocationOccupancies = await QuoteLocationOccupancy({ skipTenant: true }).find({ quoteOptionId: quoteOption._id })
        if (quoteLocationOccupancies.length > 0) {
            quoteOptionDocument["locationBasedCovers"] = await quoteOption.getLocationBasedCovers(quoteLocationOccupancies[0]._id);

        }
    }

    if (currentUser["partnerId"].brokerModeStatus == true) {
        if (!quoteOptionDocument["locationBasedCovers"]) {
            const quoteLocationOccupancies = await QuoteLocationOccupancy({ skipTenant: true }).find({ quoteOptionId: quoteOption._id })
            if (quoteLocationOccupancies.length > 0) {
                quoteOptionDocument["locationBasedCovers"] = await quoteOption.getLocationBasedCoversForBrokerModule(quoteLocationOccupancies[0]._id);
            }
        }
    }

    // quoteOptionDocument[`bscProductPartnerConfiguration`] = await quoteOption.getBscProductPartnerConfiguration();

    // If requested for allCovers specially for displaying quote slip
    quoteOptionDocument["allCoversArray"] = await quoteOption.getAllCoversArray();

    return quoteOptionDocument;
};

const addressDataFunction = (quoteOptions) => {
    const quoteOption = quoteOptions?.['allCoversArray'];

    let warranties = [];
    let exclusions = [];
    let subjectivities = [];
    let totalRiskInspectionDiscount = 0;
    const addressData = [];

    quoteOption?.quoteLocationOccupancies.map((quoteLocationOccupancy: any) => {
        const quoteLocationOccupancyId = quoteLocationOccupancy._id;
        let addonDetails = [];
        totalRiskInspectionDiscount += Math.round(Number(quoteLocationOccupancy.totalPremiumWithDiscount) ?? 0); // Ensure it's a number and round

        warranties = quoteOption?.warranties.filter(warranty => warranty?.warranty_dict?.checkbox === true);
        exclusions = quoteOption?.exclusions.filter(exclusion => exclusion?.exclusion_dict.checkbox === true);
        subjectivities = quoteOption?.subjectivities.filter(subjectivity => subjectivity?.subjectivity_dict.checkbox === true);

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.FLOATER_COVER_ADD_ON)) {
            let sectionOrCover = "Floater Cover AddOn";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.floaterCoverAddOnCovers.map((cover: any) => {
                if (Number(cover?.total ?? 0) > netPremium) netPremium = Math.round(Number(cover?.total ?? 0)); // Ensure netPremium is rounded
                if (Number(cover?.sumInsured ?? 0) > sumInsured) sumInsured = Math.round(Number(cover?.sumInsured ?? 0)); // Ensure sumInsured is rounded
            });

            addonDetails = [{
                coverName: String(sectionOrCover),  // Ensure sectionOrCover is a string
                premium: netPremium ?? 0,
                sumInsured: sumInsured ?? 0,
            }];
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_BURGLARY_HOUSEBREAKING_COVER)) {
            let sectionOrCover = "Bsc Burglary Housebreaking Cover";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.bscBurglaryHousebreakingCovers.filter((cover) => cover.quoteLocationOccupancyId == quoteLocationOccupancyId).map((cover: any) => {
                netPremium = netPremium + Math.round(Number(cover.total) ?? 0); // Ensure netPremium is a number and rounded
                sumInsured = sumInsured + Math.round(Number(cover.firstLossSumInsured) ?? 0); // Ensure sumInsured is a number and rounded
            });

            addonDetails.push({
                coverName: String(sectionOrCover), // Ensure sectionOrCover is a string
                premium: netPremium ?? 0,
                sumInsured: sumInsured ?? 0,
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_MONEY_SAFE_TILL_COVER) || quoteOption?.totalMoneySafeTill > 0) {
            let sectionOrCover = "Bsc Money Safe Till Cover";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.bscMoneySafeTillCovers.filter((cover) => cover.quoteLocationOccupancyId == quoteLocationOccupancyId).map((cover: any) => {
                netPremium = netPremium + Math.round(Number(cover.total) ?? 0); // Ensure netPremium is a number and rounded
                sumInsured = sumInsured + Math.round(Number(cover.moneySafe) ?? 0); // Ensure sumInsured is a number and rounded
            });

            addonDetails.push({
                coverName: String(sectionOrCover), // Ensure sectionOrCover is a string
                premium: netPremium ?? 0,
                sumInsured: sumInsured ?? 0,
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_ELECTRONIC_EQUIPMENTS_COVER) || quoteOption?.totalelectronicEquipment > 0) {
            let sectionOrCover = "Bsc Electronic Equipments Cover";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.bscElectronicEquipmentsCovers.filter((cover) => cover.quoteLocationOccupancyId == quoteLocationOccupancyId).map((cover: any) => {
                netPremium = netPremium + Math.round(Number(cover.total) ?? 0); // Ensure netPremium is a number and rounded
                sumInsured = sumInsured + Math.round(Number(cover.sumInsured) ?? 0); // Ensure sumInsured is a number and rounded
            });

            addonDetails.push({
                coverName: String(sectionOrCover), // Ensure sectionOrCover is a string
                premium: netPremium ?? 0,
                sumInsured: sumInsured ?? 0,
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_FIXED_PLATE_GLASS_COVER) || quoteOption?.totalFixedPlateGlass > 0) {
            let sectionOrCover = "Bsc Fixed Plate Glass Cover";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.bscFixedPlateGlassCovers.filter((cover) => cover.quoteLocationOccupancyId == quoteLocationOccupancyId).map((cover: any) => {
                netPremium = netPremium + Math.round(Number(cover.total) ?? 0); // Ensure netPremium is a number and rounded
                sumInsured = sumInsured + Math.round(Number(cover.sumInsured) ?? 0); // Ensure sumInsured is a number and rounded
            });

            addonDetails.push({
                coverName: String(sectionOrCover), // Ensure sectionOrCover is a string
                premium: netPremium ?? 0,
                sumInsured: sumInsured ?? 0,
            });
        }

        addressData.push(
            {
                address: String(quoteLocationOccupancy.locationName), // Ensure locationName is a string
                occupancy: String(quoteLocationOccupancy.occupancyId['occupancyType']), // Ensure occupancyType is a string
                premium: Math.round(Number(quoteLocationOccupancy.flexaPremium ?? 0) + Number(quoteLocationOccupancy.STFIPremium ?? 0) + Number(quoteLocationOccupancy.earthquakePremium ?? 0) + Number(quoteLocationOccupancy.terrorismPremium ?? 0)), // Ensure the premium is a number and rounded
                totalSumAssured: Math.round(Number(quoteLocationOccupancy.sumAssured ?? 0)), // Ensure sumAssured is a number and rounded
                locationDetailHeaders: ["Flexa+RSMD", "STFI", "Earthquake", "Terrorism"],
                locationDetail: [
                    Math.round(Number(quoteLocationOccupancy.flexaPremium ?? 0)),
                    Math.round(Number(quoteLocationOccupancy.STFIPremium ?? 0)),
                    Math.round(Number(quoteLocationOccupancy.earthquakePremium ?? 0)),
                    Math.round(Number(quoteLocationOccupancy.terrorismPremium ?? 0))
                ],
                addonDetails: addonDetails
            }
        );
    });

    return {
        addressData,
        warranties,
        exclusions,
        subjectivities
    };
};

const calculateCoverData = async (quoteOptions: any, quote) => {
    const quoteOption = quoteOptions?.['allCoversArray'];

    if (quoteOption) {
        const addressDataFunctionresult = await addressDataFunction(quoteOptions);
        let gstPercentage = 0.18; // GST percentage (could be dynamic)
        let covers = [];
        let sectionOrCover = quote.productId['type']
        let netPremium = 0;
        let sumInsured = 0;
        let totalRiskInspectionDiscount = 0
        let total = [];
        let discountPercentage = 0;
        let discount = {};

        quoteOption?.quoteLocationOccupancies.map((quoteLocationOccupancy: any) => {
            netPremium = netPremium + Number(quoteLocationOccupancy?.totalPremium ?? 0);
            sumInsured = sumInsured + Number(quoteLocationOccupancy?.sumAssured ?? 0);
        });

        let gst = Math.round(Number(netPremium) * Number(gstPercentage));
        covers.push({
            sectionOrCover: String(sectionOrCover),
            netPremium: Math.round(Number(netPremium) ?? 0),
            gst: Math.round(Number(gst) ?? 0),
            sumInsured: Math.round(Number(sumInsured) ?? 0),
            totalPremium: Math.round((Number(netPremium) ?? 0) + (Number(gst) ?? 0)),
            isRequired: true
        });

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_FIRE_LOSS_OF_PROFIT_COVER)) {
            let sectionOrCover = "Fire Loss Of Profit Cover";

            let netPremium = 0;
            let sumInsured = 0;

            netPremium = quoteOption?.bscFireLossOfProfitCover?.total ?? 0;
            sumInsured = Math.round(Number(quoteOption?.bscFireLossOfProfitCover?.grossProfit ?? 0) +
                Number(quoteOption?.bscFireLossOfProfitCover?.auditorsFees ?? 0));

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_BURGLARY_HOUSEBREAKING_COVER)) {
            let sectionOrCover = "Burglary Housebreaking Cover";

            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.bscBurglaryHousebreakingCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.isFirstLossOpted ? cover.firstLossSumInsured : cover.otherContents);
            });

            // Round netPremium and sumInsured
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }
        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_PORTABLE_EQUIPMENTS_COVER)) {
            let sectionOrCover = "Electrical and Mechanical Appliances";

            let netPremium = 0;
            let sumInsured = 0;

            // Iterate over the covers and calculate the total netPremium and sumInsured
            quoteOption?.bscPortableEquipmentsCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round netPremium and sumInsured
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_ELECTRONIC_EQUIPMENTS_COVER) || quoteOption?.totalelectronicEquipment > 0) {
            let sectionOrCover = "Electronic Equipments Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Iterate over the covers and calculate the total netPremium and sumInsured
            quoteOption?.bscElectronicEquipmentsCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round netPremium and sumInsured
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_MONEY_TRANSIT_COVER)) {
            let sectionOrCover = "Money Transit Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Directly assign values and round them
            netPremium = quoteOption?.bscMoneyTransitCover?.total ?? 0;
            sumInsured = quoteOption?.bscMoneyTransitCover?.singleCarryingLimit ?? 0;

            netPremium = Math.round(netPremium); // Round netPremium
            sumInsured = Math.round(sumInsured); // Round sumInsured

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_MONEY_SAFE_TILL_COVER) || quoteOption?.totalMoneySafeTill > 0) {
            let sectionOrCover = "Money Safe Till Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Iterate over the covers and calculate the total netPremium and sumInsured
            quoteOption?.bscMoneySafeTillCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.moneySafe) + Number(cover.moneyTillCounter);
            });

            // Round netPremium and sumInsured
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }
        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_FIDELITY_GUARANTEE_COVER)) {
            let sectionOrCover = "Fidelity Guarantee Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscFidelityGuaranteeCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_FIXED_PLATE_GLASS_COVER) || quoteOption?.totalFixedPlateGlass > 0) {
            let sectionOrCover = "Fixed Plate Glass Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscFixedPlateGlassCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_SIGNAGE_COVER)) {
            let sectionOrCover = "Signage Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscSignageCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.PERSONAL_ACCIDENT_COVER)) {
            let sectionOrCover = "Personal Accident Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.locationBasedCovers?.personalAccidentCoverCover.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_WORKMEN_COMPENSATION_COVER)) {
            let sectionOrCover = "Workmen Compensation Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscWorkmenCompensationCover.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_LIABILITY_SECTION_COVER)) {
            let sectionOrCover = "Liability Section Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscLiabilitySectionCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_PEDAL_CYCLE_COVER)) {
            let sectionOrCover = "Pedal Cycle Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscPedalCycleCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_ACCOMPANIED_BAGGAGE_COVER)) {
            let sectionOrCover = "Accompanied Baggage Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscAccompaniedBaggageCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.BSC_ALL_RISK_COVER)) {
            let sectionOrCover = "All Risks Cover";

            let netPremium = 0;
            let sumInsured = 0;

            // Calculate netPremium and sumInsured
            quoteOption?.bscAllRiskCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            // Round values
            netPremium = Math.round(netPremium);
            sumInsured = Math.round(sumInsured);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: netPremium,
                gst: gst,
                sumInsured: sumInsured,
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
                isRequired: true
            });
        }
        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.FLOATER_COVER_ADD_ON)) {
            let sectionOrCover = "Floater Cover AddOn";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.floaterCoverAddOnCovers.map((cover: any) => {
                netPremium = Math.max(netPremium, Number(cover?.total ?? 0));
                sumInsured = Math.max(sumInsured, Number(cover?.sumInsured ?? 0));
            });

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.ACCIDENTAL_DAMAGE)) {
            let sectionOrCover = "Accidental Damage";
            let netPremium = Number(quoteOption?.accidentalDamageCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.accidentalDamageCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.THIRD_PARTY_LIABILITY)) {
            let sectionOrCover = "Third party liability";
            let netPremium = Number(quoteOption?.thirdPartyLiabilityCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.thirdPartyLiabilityCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.TENANTS_LEGAL_LIABILITY)) {
            let sectionOrCover = "Tenants legal Liability";
            let netPremium = Number(quoteOption?.tenatLegalLiabilityCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.tenatLegalLiabilityCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.REMOVAL_OF_DEBRIS)) {
            let sectionOrCover = "Removal Of Debris";
            let netPremium = Number(quoteOption?.removalOfDebrisCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.removalOfDebrisCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.PROTECTION_AND_PRESERVATION_OF_PROPERTY)) {
            let sectionOrCover = "Protection and Preservation of Property";
            let netPremium = Number(quoteOption?.protectionAndPreservationOfPropertyCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.protectionAndPreservationOfPropertyCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.LANDSCAPING_INCLUDING_LAWNS_PLANT_SHRUBS_OR_TREES)) {
            let sectionOrCover = "Landscaping including lawns plant shrubs or trees";
            let netPremium = Number(quoteOption?.landscapingIncludingLawnsPlantShrubsOrTreesCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.landscapingIncludingLawnsPlantShrubsOrTreesCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.KEYS_AND_LOCKS)) {
            let sectionOrCover = "Keys and Locks";
            let netPremium = Number(quoteOption?.keysAndLocksCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.keysAndLocksCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.COVER_OF_VALUABLE_CONTENTS)) {
            let sectionOrCover = "Cover of Valuable Contents";
            let netPremium = Number(quoteOption?.coverOfValuableContentsCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.coverOfValuableContentsCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.CLAIM_PREPARATION_COST)) {
            let sectionOrCover = "Claim Preparation Cost";
            let netPremium = Number(quoteOption?.claimPreparationCostCover?.total ?? 0);
            let sumInsured = Number(quoteOption?.claimPreparationCostCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.ADDITIONAL_CUSTOM_DUTY)) {
            let sectionOrCover = "Additional Custom Duty";
            let netPremium = Number(quoteOption?.additionalCustomDuty?.total ?? 0);
            let sumInsured = Number(quoteOption?.additionalCustomDuty?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium) ?? 0, // Round netPremium
                gst: gst ?? 0,
                sumInsured: Math.round(sumInsured) ?? 0, // Round sumInsured
                totalPremium: Math.round(netPremium + gst) ?? 0, // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.DETERIORATION_OF_STOCKS_IN_B)) {
            let sectionOrCover = "Deterioration of Stocks in B";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.deteriorationofStocksinBCover?.total ?? 0);
            sumInsured = Number(quoteOption?.deteriorationofStocksinBCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.DETERIORATION_OF_STOCKS_IN_A)) {
            let sectionOrCover = "Deterioration of Stocks in A";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.deteriorationofStocksinACover?.total ?? 0);
            sumInsured = Number(quoteOption?.deteriorationofStocksinACover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.ESCALATION)) {
            let sectionOrCover = "Escalation";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.escalationCover?.total ?? 0);
            sumInsured = Number(quoteOption?.escalationCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.EMI_PROTECTION_COVER)) {
            let sectionOrCover = "EMI Protection Cover";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.emiProtectionCover?.total ?? 0);
            sumInsured = Number(quoteOption?.emiProtectionCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.INSURANCE_OF_ADDITIONAL_EXPENSE)) {
            let sectionOrCover = "Insurance of additional expense";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.insuranceOfAdditionalExpenseCover?.total ?? 0);
            sumInsured = Number(quoteOption?.insuranceOfAdditionalExpenseCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.INVOLUNTARY_BETTERMENT)) {
            let sectionOrCover = "Involuntary betterment";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.involuntaryBettermentCover?.total ?? 0);
            sumInsured = Number(quoteOption?.involuntaryBettermentCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.DECLARATION_POLICY)) {
            let sectionOrCover = "Declaration Policy";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.declarationPolicyCover?.total ?? 0);
            sumInsured = Number(quoteOption?.declarationPolicyCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.LOSE_OF_RENT)) {
            let sectionOrCover = "Lose Of Rent";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.loseOfRentCover?.total ?? 0);
            sumInsured = Number(quoteOption?.loseOfRentCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.RENT_FOR_ALTERNATIVE_ACCOMODATION)) {
            let sectionOrCover = "Rent For Alternative Accomodation";
            let netPremium = 0;
            let sumInsured = 0;

            netPremium = Number(quoteOption?.rentForAlternativeAccomodationCover?.total ?? 0);
            sumInsured = Number(quoteOption?.rentForAlternativeAccomodationCover?.sumInsured ?? 0);

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        if (quoteOptions?.selectedAllowedProductBscCover.includes(AllowedProductBscCover.VALUABLE_CONTENTS_ON_AGREED_VALUE_BASIS)) {
            let sectionOrCover = "Valuable Contents On Agreed Value Basis";
            let netPremium = 0;
            let sumInsured = 0;

            quoteOption?.valuableContentsOnAgreedValueBasisCovers.map((cover: any) => {
                netPremium = netPremium + Number(cover.total);
                sumInsured = sumInsured + Number(cover.sumInsured);
            });

            let gst = Math.round(netPremium * gstPercentage); // Round GST

            covers.push({
                sectionOrCover: sectionOrCover,
                netPremium: Math.round(netPremium), // Round netPremium
                gst: gst,
                sumInsured: Math.round(sumInsured), // Round sumInsured
                totalPremium: Math.round(netPremium + gst), // Round totalPremium
            });
        }

        // ------------------------------------------------
        let totalNetPremium = 0;
        let totalGst = 0;
        let totalSumInsured = 0;
        let totalPremium = 0;

        covers.map((cover: any) => {
            totalNetPremium = totalNetPremium + (Number(cover.netPremium) || 0); // Ensure it's a number
            totalGst = totalGst + (Number(cover.gst) || 0); // Ensure it's a number
            totalSumInsured = totalSumInsured + (Number(cover.sumInsured) || 0); // Ensure it's a number
            totalPremium = totalPremium + (Number(cover.totalPremium) || 0); // Ensure it's a number
        });

        const totalNetPremiumWithDiscount = totalNetPremium + totalRiskInspectionDiscount;
        const gstOnNetPremiumWithDiscount = totalNetPremiumWithDiscount * gstPercentage;
        const totalPremiumWithGst = totalNetPremiumWithDiscount + gstOnNetPremiumWithDiscount;

        // Push the total values after rounding
        covers.push({
            sectionOrCover: 'Total',
            netPremium: Math.round(totalNetPremiumWithDiscount) || 0,
            gst: Math.round(gstOnNetPremiumWithDiscount) || 0,
            sumInsured: Math.round(totalSumInsured) || 0,
            totalPremium: Math.round(totalPremiumWithGst) || 0,
        });

        total.push({
            sectionOrCover: 'Total',
            netPremium: Math.round(totalNetPremiumWithDiscount) || 0,
            gst: Math.round(gstOnNetPremiumWithDiscount) || 0,
            sumInsured: Math.round(totalSumInsured) || 0,
            totalPremium: Math.round(totalPremiumWithGst) || 0,
        });

        // Handling discount if applicable
        discountPercentage = quoteOption?.discountId ? Number(quoteOption?.discountId['discountPercentage']) : 0;

        if (discountPercentage > 0) {
            // Apply discount calculations with proper rounding and handling of null or undefined values
            let discountedTotalNetPremium = totalNetPremium - totalNetPremium * (discountPercentage / 100);
            let discountedTotalGst = totalGst - totalGst * (discountPercentage / 100);
            let discountedTotalSumInsured = totalSumInsured - totalSumInsured * (discountPercentage / 100);
            let discountedTotalPremium = totalPremium - totalPremium * (discountPercentage / 100);

            // Store the discounted values, rounding them safely
            discount = {
                sectionOrCover: 'Discount Premium',
                netPremium: Math.round(discountedTotalNetPremium) || 0,
                gst: Math.round(discountedTotalGst) || 0,
                sumInsured: Math.round(discountedTotalSumInsured) || 0,
                totalPremium: Math.round(discountedTotalPremium) || 0,
            };
        }
        return {
            gstPercentage,
            covers,
            totalNetPremium,
            totalGst,
            totalSumInsured,
            totalPremium,
            sectionOrCover,
            netPremium,
            sumInsured,
            totalRiskInspectionDiscount,
            total,
            discountPercentage,
            discount,
            addressDataFunctionresult,
        }
    } else {
        return {};
    }
};

const html_to_pdf = async ({ templateHtml, dataBindingForDoc, options }) => {
    // Register custom Handlebars helper to add 1 to the index
    handlebars.registerHelper('indexPlusOne', function (index) {
        return index + 1;
    });

    const template = handlebars.compile(templateHtml);
    const finalHtml = template(dataBindingForDoc); // Compile the HTML without encoding

    const browser = await puppeteer.launch({
        args: ["--no-sandbox"],
        headless: true,  // It's recommended to run true headless in production
    });

    const page = await browser.newPage();
    await page.setContent(finalHtml, { waitUntil: 'networkidle0' }); // Use setContent instead of data URI

    let pdfBuffer = await page.pdf(options); // Generate the PDF buffer
    await browser.close();

    return pdfBuffer;
};

const convertPdfToDocx = (pdfPath: string, docxFilePath: string): Promise<boolean> => {
    return new Promise<boolean>((resolve, reject) => {
        try {
            const pythonScriptPath = path.join(__dirname, `../../public/downloadDocument/py_scripts/convert_pdf_to_docx.py`);
            const command = `python3 ${pythonScriptPath} ${pdfPath} ${docxFilePath}`;

            exec(command, (error, stdout, stderr) => {
                if (error) {
                    // If there's an error in the execution, reject with false
                    return reject(false);
                }
                // if (stderr) {
                //   // If there's any stderr, reject with false
                //   return reject(false);
                // }
                // If no error occurs, resolve with true
                resolve(true);
            });
        } catch (error) {
            console.log({ error })
            return reject(false);
        }
    });
};

const downloadDocument = catchAsync(async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { quoteId, fileFormatToGenerate, quoteNo, quoteState } = req.body;

        // Input validation
        if (!quoteId || !fileFormatToGenerate) {
            return next(new AppError("Both quoteId and fileFormatToGenerate are required.", 400));
        }

        // Read the template file
        const templateHtml = fs.readFileSync(path.join(__dirname, `../../public/downloadDocument/quoteslip_blus_template.html`), "utf-8");

        // Define the directory where the PDF will be saved
        const destinationDirectory = path.join(__dirname, '../../public/uploads/pdfs/');
        if (!fs.existsSync(destinationDirectory)) {
            fs.mkdirSync(destinationDirectory, { recursive: true });
        }

        // Create a unique filename with a timestamp
        const timestamp = new Date().toISOString().replace(/[-:.]/g, '');  // Clean up timestamp for valid filename
        // const pdfFileName = `quoteslip_${quoteId}_${timestamp}.pdf`;
        // const docxFileName = `quoteslip_${quoteId}_${timestamp}.docx`; 
        const pdfFileName = quoteState == AllowedQuoteStates.PENDING_REQUISTION_FOR_QUOTE ? `RFP_Slip_${quoteNo}.pdf` :
            quoteState == AllowedQuoteStates.WAITING_FOR_APPROVAL ? `RFQ_Slip_${quoteNo}.pdf` :
                `Placement_Slip_${quoteNo}.pdf`;
        const docxFileName = quoteState == AllowedQuoteStates.PENDING_REQUISTION_FOR_QUOTE ? `RFP_Slip_${quoteNo}.docx` :
            quoteState == AllowedQuoteStates.WAITING_FOR_APPROVAL ? `RFQ_Slip_${quoteNo}.docx` :
                `Placement_Slip_${quoteNo}.docx`;

        // PDF generation options
        const options = {
            format: "A4",
            headerTemplate: "<p></p>",
            footerTemplate: "<p></p>",
            displayHeaderFooter: false,
            margin: {
                top: "40px",
                bottom: "40px",
                left: "20px",
                right: "20px",
            },
            printBackground: true,
            path: path.join(destinationDirectory, pdfFileName),
        };

        const dataBindingForDoc = await getAllOptionsByQuoteId(quoteId);

        // Call the function to generate PDF buffer
        const pdfBuffer = await html_to_pdf({ templateHtml, dataBindingForDoc, options });

        if (pdfBuffer) {
            console.log(" ---------- Done: quoteslip_template is created! ---------- ");

            // Use sendFile to send the PDF file as a response
            const pdfFilePath = path.join(destinationDirectory, pdfFileName);
            const docxFilePath = path.join(destinationDirectory, docxFileName);

            // ---------- Commn variable name ----------
            let fileName = pdfFileName;
            let filePath = pdfFilePath;
            // Handle DOCX generation
            if (fileFormatToGenerate === 'DOCX') {
                fileName = docxFileName;
                filePath = docxFilePath;

                try {
                    const convertPdfToDocxResult = await convertPdfToDocx(pdfFilePath, docxFilePath);

                    if (convertPdfToDocxResult) {
                        console.log('PDF converted to DOCX successfully!');
                    } else {
                        console.log('Conversion failed.');
                        return res.status(500).json({
                            status: 500,
                            message: 'Error Conversion failed while converting PDF to DOCX',
                        });
                    }
                    console.log(" ---------- Done: PDF converted to DOCX ---------- ");

                } catch (error) {
                    console.error("Error converting PDF to DOCX:", error);
                    return res.status(500).json({
                        status: 500,
                        message: 'Error converting PDF to DOCX',
                    });
                }
            }
            // ---------- sendFile ----------
            res.sendFile(filePath, (err) => {
                if (err) {
                    console.error("Error sending file:", err);
                    next(new AppError(`Failed to send ${fileFormatToGenerate} file`, 500));
                } else {
                    console.log(`File sent successfully: ${fileName}`);
                }
            });
        } else {
            return res.status(500).json({
                status: 500,
                message: 'Failed to generate quoteslip_template.pdf',
            });
        }
    } catch (err) {
        console.error("ERROR:", err);
        return next(new AppError("Internal server error", 500));
    }
});

type GenerateQuoteDocumentResult =
    | { fileName: string; filePath: string }
    | { error: string }
    | "Failed to generate quoteslip_template.pdf";

const generateQuoteDocumentForGMC = async (
    quoteId: string,
    fileFormatToGenerate: string
): Promise<GenerateQuoteDocumentResult> => {
    try {
        if (!quoteId || !fileFormatToGenerate) {
            return { error: "Both quoteId and fileFormatToGenerate are required" };
        }

        const templateHtml = fs.readFileSync(
            path.join(__dirname, `../../public/downloadDocument/quoteslip_blus_template.html`),
            "utf-8"
        );

        const destinationDirectory = path.join(__dirname, "../../public/uploads/pdfs/");
        if (!fs.existsSync(destinationDirectory)) {
            fs.mkdirSync(destinationDirectory, { recursive: true });
        }

        const timestamp = new Date().toISOString().replace(/[-:.]/g, "");
        const pdfFileName = `quoteslip_${quoteId}_${timestamp}.pdf`;
        const docxFileName = `quoteslip_${quoteId}_${timestamp}.docx`;

        const options = {
            format: "A4",
            headerTemplate: "<p></p>",
            footerTemplate: "<p></p>",
            displayHeaderFooter: false,
            margin: {
                top: "40px",
                bottom: "40px",
                left: "20px",
                right: "20px",
            },
            printBackground: true,
            path: path.join(destinationDirectory, pdfFileName),
        };

        const dataBindingForDoc = await getAllOptionsByQuoteId(quoteId);

        const pdfBuffer = await html_to_pdf({ templateHtml, dataBindingForDoc, options });

        if (pdfBuffer) {
            const pdfFilePath = path.join(destinationDirectory, pdfFileName);
            const docxFilePath = path.join(destinationDirectory, docxFileName);

            if (fileFormatToGenerate === "DOCX") {
                try {
                    const conversionSuccess = await convertPdfToDocx(pdfFilePath, docxFilePath);
                    if (!conversionSuccess) {
                        return { error: "Error converting PDF to DOCX" };
                    }
                    return { fileName: docxFileName, filePath: docxFilePath };
                } catch (error) {
                    console.error("Error converting PDF to DOCX:", error);
                    return { error: "Error converting PDF to DOCX" };
                }
            }

            return { fileName: pdfFileName, filePath: pdfFilePath };
        } else {
            return "Failed to generate quoteslip_template.pdf";
        }
    } catch (err) {
        console.error("ERROR:", err);
        return { error: "Internal server error while generating document" };
    }
};


export default {
    downloadDocument,
    generateQuoteDocumentForGMC
};