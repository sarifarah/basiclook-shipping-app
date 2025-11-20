// -------------------------------------------
// BasicLook Shipping App - Main Server File
// -------------------------------------------
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
// CREATE SHIPPING LABEL ROUTE
// ------------------------------
app.post("/create-label", async (req, res) => {
  try {
    const { order_id } = req.body;

    if (!order_id) {
      return res.status(400).json({ error: "order_id is required" });
    }

    // 1️⃣ Fetch Order Info From Shopify
    const shopifyOrder = await shopify.get(`/orders/${order_id}.json`);

    const order = shopifyOrder.data.order;
    const shippingAddress = order.shipping_address;

    if (!shippingAddress) {
      return res.status(400).json({ error: "Order has no shipping address" });
    }

    // 2️⃣ Build Aramex Shipment Payload
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

    // 3️⃣ Send Request to Aramex API
    const aramexResponse = await axios.post(
      `${ARAMEX_BASE_URL}/CreateShipments`,
      shipmentPayload,
      {
        headers: { "Content-Type": "application/json" },
      }
    );

    const result = aramexResponse.data;

    // 4️⃣ Extract label URL
    if (!result.Shipments || !result.Shipments[0].ShipmentLabelURL) {
      return res.status(500).json({
        error: "Aramex did not return a label URL",
        aramex_response: result,
      });
    }

    const labelUrl = result.Shipments[0].ShipmentLabelURL;

    // 5️⃣ Return Label URL to Shopify App
    return res.json({
      success: true,
      label_url: labelUrl,
      airwaybill: result.Shipments[0].ID
    });

  } catch (err) {
    console.error("ERROR creating label:", err.response?.data || err);
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
