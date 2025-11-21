// -------------------------------------------
// BasicLook Shipping App - Main Server File
// -------------------------------------------

// Load env variables (Railway injects them automatically, but this helps locally)
require("dotenv").config();

const express = require("express");
const axios = require("axios");
const bodyParser = require("body-parser");

const app = express();
app.use(bodyParser.json());

// ------------------------------
// Load environment variables
// ------------------------------
const {
  SHOPIFY_ADMIN_ACCESS_TOKEN,
  SHOP_DOMAIN,
  ARAMEX_ACCOUNT_NUMBER,
  ARAMEX_ACCOUNT_PIN,
  ARAMEX_API_KEY,
  ARAMEX_API_SECRET,
  ARAMEX_BASE_URL,
  ARAMEX_COUNTRY_CODE,
  ARAMEX_ENTITY,
  APP_MODE
} = process.env;

// ------------------------------
// Shopify API Helper
// ------------------------------
const shopify = axios.create({
  baseURL: `https://${SHOP_DOMAIN}/admin/api/2024-01`,
  headers: {
    "X-Shopify-Access-Token": SHOPIFY_ADMIN_ACCESS_TOKEN,
    "Content-Type": "application/json",
  },
});

// ------------------------------
// Test Route
// ------------------------------
app.get("/", (req, res) => {
  res.send("BasicLook Shipping App backend is running!");
});

// ------------------------------
// GET SHIPPING RATES (TEST ENDPOINT)
// ------------------------------
app.get("/shipping-rates", (req, res) => {
  res.json({
    message: "Shipping rates endpoint working!",
    example_route: "POST /aramex/rate"
  });
});

// ------------------------------
// ARAMEX RATE CALCULATION
// ------------------------------
app.post("/aramex/rate", async (req, res) => {
  try {
    const {
      origin_city,
      origin_country_code,
      destination_city,
      destination_country_code,
      weight
    } = req.body;

    if (!origin_city || !destination_city || !weight) {
      return res.status(400).json({ error: "Missing required rate parameters" });
    }

    const payload = {
      ClientInfo: {
        UserName: ARAMEX_API_KEY,
        Password: ARAMEX_API_SECRET,
        Version: "v1",
        AccountNumber: ARAMEX_ACCOUNT_NUMBER,
        AccountPin: ARAMEX_ACCOUNT_PIN,
        AccountEntity: ARAMEX_ENTITY,
        AccountCountryCode: ARAMEX_COUNTRY_CODE,
      },
      OriginAddress: {
        City: origin_city,
        CountryCode: origin_country_code,
      },
      DestinationAddress: {
        City: destination_city,
        CountryCode: destination_country_code,
      },
      ShipmentDetails: {
        ActualWeight: { Value: weight, Unit: "KG" },
        NumberOfPieces: 1,
        ProductGroup: "EXP",
        ProductType: "PPX",
      },
    };

    const aramexResponse = await axios.post(
      `${ARAMEX_BASE_URL}/CalculateRate`,
      payload,
      { headers: { "Content-Type": "application/json" } }
    );

    res.json(aramexResponse.data);
  } catch (err) {
    console.error("RATE ERROR:", err.response?.data || err);
    res.status(500).json({
      error: "Rate request failed",
      details: err.response?.data || err.message
    });
  }
});

// ------------------------------
// CREATE SHIPPING LABEL
// ------------------------------
app.post("/create-label", async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: "order_id is required" });
    }

    // 1️⃣ Fetch Order from Shopify
    const shopifyOrder = await shopify.get(`/orders/${order_id}.json`);
    const order = shopifyOrder.data.order;
    const shippingAddress = order.shipping_address;

    if (!shippingAddress) {
      return res.status(400).json({ error: "Order has no shipping address" });
    }

    // 2️⃣ Build Aramex Shipment
    const shipmentPayload = {
      ClientInfo: {
        UserName: ARAMEX_API_KEY,
        Password: ARAMEX_API_SECRET,
        Version: "v1",
        AccountNumber: ARAMEX_ACCOUNT_NUMBER,
        AccountPin: ARAMEX_ACCOUNT_PIN,
        AccountEntity: ARAMEX_ENTITY,
        AccountCountryCode: ARAMEX_COUNTRY_CODE,
      },
      Shipments: [
        {
          Reference1: `Order-${order_id}`,
          Shipper: {
            Name: "BasicLook",
            CellPhone: "0790000000",
            City: "Amman",
            CountryCode: "JO",
          },
          Consignee: {
            Name: `${shippingAddress.first_name} ${shippingAddress.last_name}`,
            PhoneNumber1: shippingAddress.phone,
            City: shippingAddress.city,
            CountryCode: shippingAddress.country_code,
            Line1: shippingAddress.address1,
          },
          Details: {
            ActualWeight: { Unit: "KG", Value: 1 },
            NumberOfPieces: 1,
            ProductGroup: "EXP",
            ProductType: "PPX",
            PaymentType: "P",
            DescriptionOfGoods: "Clothes",
          },
        }
      ],
      LabelInfo: {
        ReportID: 9729,
        ReportType: "URL",
      },
    };

    // 3️⃣ Request Label from Aramex
    const aramexResponse = await axios.post(
      `${ARAMEX_BASE_URL}/CreateShipments`,
      shipmentPayload,
      { headers: { "Content-Type": "application/json" } }
    );

    const result = aramexResponse.data;

    if (!result.Shipments || !result.Shipments[0].ShipmentLabelURL) {
      return res.status(500).json({
        error: "Aramex did not return a label URL",
        aramex_response: result,
      });
    }

    // 4️⃣ Return Label URL
    return res.json({
      success: true,
      label_url: result.Shipments[0].ShipmentLabelURL,
      airwaybill: result.Shipments[0].ID
    });

  } catch (err) {
    console.error("LABEL ERROR:", err.response?.data || err);
    res.status(500).json({ error: "Label creation failed", details: err.message });
  }
});

// ------------------------------
// Start Server
// ------------------------------
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
