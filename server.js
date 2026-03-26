const express = require('express');
const app = express();

app.use(express.text({ type: '*/xml' }));
app.use(express.urlencoded({ extended: true }));

// In-memory session store: buyerCookie -> returnUrl
app.locals.sessions = {};

// ─────────────────────────────────────────────
// STEP 1: D365 POSTs cXML here to start PunchOut
// ─────────────────────────────────────────────
app.post('/punchout', (req, res) => {
  const body = req.body || '';
  console.log('[PunchOut Setup Request Received]');
  console.log(body);

  // Extract BuyerCookie and BrowserFormPost return URL from cXML
  const cookieMatch = body.match(/<BuyerCookie>(.*?)<\/BuyerCookie>/);
  const returnUrlMatch = body.match(/<URL>(https?:\/\/[^<]+)<\/URL>/);

  const buyerCookie = cookieMatch ? cookieMatch[1] : `cookie-${Date.now()}`;
  const returnUrl = returnUrlMatch ? returnUrlMatch[1] : '';

  console.log(`[Session] Cookie: ${buyerCookie} | ReturnURL: ${returnUrl}`);

  // Store session
  app.locals.sessions[buyerCookie] = returnUrl;

  const timestamp = new Date().toISOString();
  const host = req.protocol + '://' + req.get('host');
  const startPageUrl = `https://${req.get('host')}/catalog?cookie=${encodeURIComponent(buyerCookie)}`;

  const responseXml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cXML.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="mock-response-${Date.now()}@catalog" timestamp="${timestamp}">
  <Response>
    <Status code="200" text="OK"/>
    <PunchOutSetupResponse>
      <StartPage>
        <URL>${startPageUrl}</URL>
      </StartPage>
    </PunchOutSetupResponse>
  </Response>
</cXML>`;

  console.log('[PunchOut Setup Response Sent]');
  res.set('Content-Type', 'text/xml');
  res.send(responseXml);
});

// ─────────────────────────────────────────────
// STEP 2: Browser redirects here — show mock catalog
// ─────────────────────────────────────────────
app.get('/catalog', (req, res) => {
  const cookie = req.query.cookie || '';
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Mock Supplier Catalog</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 700px; margin: 40px auto; padding: 0 20px; background: #f5f5f5; }
    h1 { color: #1a1a2e; border-bottom: 2px solid #4a90e2; padding-bottom: 10px; }
    .product { background: white; border: 1px solid #ddd; border-radius: 8px; padding: 20px; margin: 16px 0; display: flex; justify-content: space-between; align-items: center; }
    .product-info h3 { margin: 0 0 6px 0; color: #333; }
    .product-info p { margin: 0; color: #777; font-size: 14px; }
    .price { font-size: 22px; font-weight: bold; color: #2e7d32; margin-right: 16px; }
    .btn { background: #4a90e2; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-size: 15px; }
    .btn:hover { background: #357abd; }
    .badge { background: #e3f2fd; color: #1565c0; font-size: 12px; padding: 2px 8px; border-radius: 10px; margin-left: 8px; }
  </style>
</head>
<body>
  <h1>🛒 Mock Supplier Catalog</h1>
  <p style="color:#555">Select an item to add to your D365 purchase requisition.</p>

  <div class="product">
    <div class="product-info">
      <h3>Widget A <span class="badge">WGT-001</span></h3>
      <p>Standard office widget, unit of measure: EA</p>
    </div>
    <div style="display:flex;align-items:center">
      <span class="price">$25.00 CAD</span>
      <form method="POST" action="/addtocart">
        <input type="hidden" name="cookie" value="${cookie}" />
        <input type="hidden" name="product" value="widget" />
        <button class="btn" type="submit">Add to Cart →</button>
      </form>
    </div>
  </div>

  <div class="product">
    <div class="product-info">
      <h3>Gadget B <span class="badge">GDG-002</span></h3>
      <p>Premium gadget, unit of measure: EA</p>
    </div>
    <div style="display:flex;align-items:center">
      <span class="price">$75.00 CAD</span>
      <form method="POST" action="/addtocart">
        <input type="hidden" name="cookie" value="${cookie}" />
        <input type="hidden" name="product" value="gadget" />
        <button class="btn" type="submit">Add to Cart →</button>
      </form>
    </div>
  </div>

  <div class="product">
    <div class="product-info">
      <h3>Office Supply Pack <span class="badge">OSP-003</span></h3>
      <p>Bulk office supplies, unit of measure: BOX</p>
    </div>
    <div style="display:flex;align-items:center">
      <span class="price">$149.99 CAD</span>
      <form method="POST" action="/addtocart">
        <input type="hidden" name="cookie" value="${cookie}" />
        <input type="hidden" name="product" value="supplypack" />
        <button class="btn" type="submit">Add to Cart →</button>
      </form>
    </div>
  </div>
</body>
</html>
  `);
});

// ─────────────────────────────────────────────
// STEP 3: User clicks item — POST cart back to D365
// ─────────────────────────────────────────────
app.post('/addtocart', (req, res) => {
  const cookie = req.body.cookie;
  const product = req.body.product;
  const returnUrl = app.locals.sessions[cookie] || '';

  console.log(`[Add to Cart] Cookie: ${cookie} | Product: ${product} | ReturnURL: ${returnUrl}`);

  const products = {
    widget:      { name: 'Widget A',           price: '25.00',  currency: 'CAD', uom: 'EA',  partNum: 'WGT-001', unspsc: '44121618' },
    gadget:      { name: 'Gadget B',           price: '75.00',  currency: 'CAD', uom: 'EA',  partNum: 'GDG-002', unspsc: '43211503' },
    supplypack:  { name: 'Office Supply Pack', price: '149.99', currency: 'CAD', uom: 'BOX', partNum: 'OSP-003', unspsc: '44111500' }
  };

  const p = products[product] || products.widget;
  const timestamp = new Date().toISOString();

  const orderCxml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cXML SYSTEM "http://xml.cXML.org/schemas/cXML/1.2.014/cXML.dtd">
<cXML payloadID="mock-order-${Date.now()}@catalog" timestamp="${timestamp}">
  <Header>
    <From><Credential domain="DUNS"><Identity>987654321</Identity></Credential></From>
    <To><Credential domain="DUNS"><Identity>123456789</Identity></Credential></To>
    <Sender>
      <Credential domain="NetworkId"><Identity>DEMO-BUYER-001</Identity></Credential>
      <UserAgent>MockCatalog/1.0</UserAgent>
    </Sender>
  </Header>
  <Message>
    <PunchOutOrderMessage>
      <BuyerCookie>${cookie}</BuyerCookie>
      <PunchOutOrderMessageHeader operationAllowed="create">
        <Total><Money currency="${p.currency}">${p.price}</Money></Total>
      </PunchOutOrderMessageHeader>
      <ItemIn quantity="1">
        <ItemID>
          <SupplierPartID>${p.partNum}</SupplierPartID>
        </ItemID>
        <ItemDetail>
          <UnitPrice><Money currency="${p.currency}">${p.price}</Money></UnitPrice>
          <Description xml:lang="en">${p.name}</Description>
          <UnitOfMeasure>${p.uom}</UnitOfMeasure>
          <Classification domain="UNSPSC">${p.unspsc}</Classification>
          <ManufacturerName>Mock Supplier Inc.</ManufacturerName>
        </ItemDetail>
      </ItemIn>
    </PunchOutOrderMessage>
  </Message>
</cXML>`;

  console.log('[PunchOutOrderMessage Sent to D365]');

  // Auto-submit form back to D365 return URL
  res.send(`
<!DOCTYPE html>
<html>
<head><title>Returning to D365...</title></head>
<body>
  <p style="font-family:Arial;text-align:center;margin-top:80px;color:#555">
    ✅ Item selected. Returning to D365...
  </p>
  <form id="returnForm" method="POST" action="${returnUrl}">
    <input type="hidden" name="cXML-urlencoded" value="${encodeURIComponent(orderCxml)}" />
  </form>
  <script>
    setTimeout(function() { document.getElementById('returnForm').submit(); }, 500);
  </script>
</body>
</html>
  `);
});

// Health check
app.get('/', (req, res) => res.send('Mock PunchOut Catalog is running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Mock catalog running on port ${PORT}`));
