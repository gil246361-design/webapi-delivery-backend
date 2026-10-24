# Web API: Customers, Orders, and Delivery Routes

## Run locally
1. Install Node.js 22.22.3+ (or a supported newer version).
2. Run `npm install`.
3. Copy `.env.example` to `.env` and set DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME.
4. Run `npm run dev`. API listens on port 3000 by default.

## Customer endpoints
- `GET /api/customers` — list all customers
- `GET /api/customers/search?keyword=สม` — partial match against the full name field (works for first name or surname because both are stored in `name`)
- `GET /api/customers/nearby-1km?lat=16.2465&lng=103.2535` — customers within 1 km straight-line radius; omitted coordinates default to the shop
- `POST /api/customers` — add `{ "name", "phone", "latitude", "longitude" }`
- `PUT /api/customers/:customer_id` — edit customer fields
- `DELETE /api/customers/:customer_id` — delete customer and their orders

## Order endpoints
- `GET /api/orders` — list orders including customer details
- `GET /api/orders/nearby-2km?lat=...&lng=...` — orders within 2 km straight-line radius
- `POST /api/orders/seed` — replace current orders with 20–30 simulated orders, including customer and box quantity
- `POST /api/orders` — add `{ "customer_id", "quantity" }`
- `PUT /api/orders/:order_id` — edit quantity and/or customer
- `DELETE /api/orders/:order_id` — delete one order
- `DELETE /api/orders/clear` — delete all orders

## Route planning
- `POST /api/routes/plan` with `{ "attempt": 1 }` — calculate a delivery plan
- `GET /api/routes/latest` — latest saved plan
- `GET /api/jobs/:code` — rider's job

Customer/order radius checks use straight-line distance. The Angular map uses OSRM/OpenStreetMap road geometry to draw road-following routes instead of straight lines across rivers or other areas without roads. OSRM requires internet access; if it is unavailable, the map keeps the pins and does not draw a potentially misleading straight line.


## Important routing assumptions
- The shop coordinates are configured in `routing.ts`; verify this is the actual shop location before testing.
- Orders are rejected from route planning if any customer is outside the 3 km straight-line radius from the shop.
- Route distance and estimated drive time are obtained from the OSRM road-network table, not straight-line distance. If OSRM cannot provide a road connection, planning fails clearly instead of drawing a straight-line route.
- The optimization tests heuristic route groupings and order permutations within each rider route. It is a practical heuristic, not a mathematical proof of globally optimal VRP. “Recalculate” offers another candidate plan.
- Travel time is an estimate from OSRM and does not include kitchen packing, parking, handover/service time, or live traffic. Therefore it cannot guarantee delivery by 12:30 in real-world traffic.
- The public OSRM demo service has rate/availability limits; for production use, configure a self-hosted OSRM or a routing provider with a suitable service plan.
