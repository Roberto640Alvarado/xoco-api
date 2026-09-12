# Buscador de compradores + Efectivo y otros medios (backend)

## Objetivo

Feedback del negocio, dos pedidos juntos: "también creo que sería
conveniente otro módulo de poder buscar compradores" y "si se puede en
ventas hacer otro apartado de ventas efectivo y otros medios, no sé si
esto se pueda obtener también por tiendas para filtrarlos así también y
las fechas".

Antes de implementar se confirmaron 4 decisiones de diseño con el
usuario (todas la opción recomendada):

- Buscador: cualquier cliente con facturas en Odoo, no solo Selectos /
  Operadora del Sur (ver `WHOLESALE_CLIENTS`, módulo Ventas Mayoreo).
- Buscador: totales facturados en el rango, no detalle factura por
  factura.
- Efectivo y otros medios: módulo nuevo en el menú, con sus propios
  filtros (no otra pestaña dentro de un módulo existente).
- Efectivo y otros medios: 2 categorías (Efectivo vs. otros medios) MÁS
  el detalle completo por método de pago debajo.

## Investigación (Odoo, solo lectura)

Antes de diseñar se corrieron 2 scripts de solo lectura (`execute_kw`
contra Odoo con las credenciales ya configuradas en Mongo, igual que hace
la app en producción — nunca se imprimieron credenciales, solo
estructura y datos de negocio; los scripts se borraron después de usarlos):

- **`pos.payment.method`**: campos `id, name, type, active, company_id`.
  Los datos reales tienen `type: 'cash'` (un método "Efectivo" POR
  TIENDA — "Efectivo Ramblas", "Efectivo Escalón", etc., cada tienda con
  el suyo) y `type: 'bank'`/`'pay_later'` para todo lo demás (Tarjeta,
  Davivienda, Cuscatlán, Transferencias, Payway, QR, Pedidos Ya, Cuenta
  de cliente). Esto confirma que "Efectivo" se agrupa por `type`, no por
  nombre — sumar todos los métodos con `type: 'cash'` da el Efectivo
  total sin importar de qué tienda salió cada uno.
- **`pos.payment`**: campos `pos_order_id` (m2o a `pos.order`), `amount`,
  `payment_method_id`, `payment_date`, `partner_id`, `session_id`. NO
  tiene un campo de tienda propio — el filtro por tienda/fecha se
  resuelve por las `pos.order` del rango pedido (mismo domain que ya usa
  `findDailySummary`/`findPaymentMethodsSummary` para todo lo demás de
  caja), y luego se agrupan los pagos de esas órdenes por método de pago.
- Se confirmó en vivo que Odoo soporta filtrar `account.move` por un
  campo del related vía notación con punto:
  `['partner_id.name', 'ilike', 'texto']` funciona igual en `read_group`
  que en `search_read` — así el buscador de compradores no necesita una
  consulta aparte a `res.partner`.

## Cambios

### Módulo A — Buscador de compradores (`GET /sales/customers/search`)

- `src/sales/dto/find-customer-search-query.dto.ts` (nuevo): `q` (mínimo
  2 caracteres), `dateFrom`, `dateTo?`, `limit` (default 30).
- `src/sales/doc/sales.doc.ts`: `CustomerSearchResultDoc` — extiende
  `InvoiceTotalsDoc` (mismo shape que ya usa Ventas Mayoreo) con
  `partnerId/partnerName/commercialPartnerId/commercialPartnerName`.
- `src/sales/services/customer-search.service.ts` (nuevo):
  `CustomerSearchService.search()` — un solo `read_group` de
  `account.move` reutilizando `buildCustomerInvoiceDomain()` (el mismo
  domain compartido de facturas de cliente que ya usa el reporte de
  visitas por vendedor) más el filtro
  `['partner_id.name', 'ilike', q]`, agrupado por
  `(partner_id, commercial_partner_id)`. Cuando el partner no tiene
  empresa matriz (`commercial_partner_id` en `false`), usa el propio
  partner como "comercial". Ordena por `amountTotal` descendente y
  aplica `limit`.
- `src/sales/sales.module.ts`: registrado `CustomerSearchService`.
- `src/sales/controllers/sales.controller.ts`: endpoint
  `GET /sales/customers/search`.

### Módulo B — Efectivo y otros medios (`GET /sales/payment-methods`)

- `src/odoo/types/odoo-entities.types.ts`: nuevo tipo
  `OdooPosPaymentGroup` (fila de `pos.payment.read_group`).
- `src/odoo/repositories/odoo.repository.ts` /
  `src/odoo/services/odoo.service.ts`: nuevo método
  `readGroupPosPayments()`.
- `src/sales/doc/sales.doc.ts`: `PaymentMethodTotalsDoc`,
  `PaymentMethodBucketDoc`, `PaymentMethodsSummaryDoc`.
- `src/sales/services/sales.service.ts`: nuevo método
  `findPaymentMethodsSummary()` — reutiliza `FindDailySummaryQueryDto`
  (mismo query que `findDailySummary`, sin duplicar un DTO casi idéntico)
  y `buildOrdersDomain()` (mismo domain de tienda/fecha/excluir
  canceladas que el resto de reportes de caja). Trae las órdenes del
  rango, agrupa los pagos de esas órdenes (`pos.payment`) por método, y
  separa en 2 baldes según `pos.payment.method.type`: `cash` → Efectivo,
  cualquier otro `type` → `other`. Los montos de los baldes se redondean
  con `roundMoney()` en cada acumulación — sin esto, sumar montos de
  varios métodos arrastraba el error de coma flotante típico de JS
  (`79.71` salía como `79.71000000000001`, detectado por el test antes
  de llegar a producción).
- `src/sales/controllers/sales.controller.ts`: endpoint
  `GET /sales/payment-methods` (mismo `FindDailySummaryQueryDto` que
  `/sales/daily-summary`: `dateFrom`, `dateTo?`, `posConfigId?`).

### Tests

- `src/sales/tests/customer-search.service.spec.ts` (nuevo, 4 tests):
  cualquier comprador (no solo mayoreo), fallback a `partnerId` cuando no
  hay `commercial_partner_id`, orden descendente + `limit`, domain
  exacto que se le pide a Odoo (con y sin `dateTo`).
- `src/sales/tests/sales.service.spec.ts`: nuevo `describe`
  `findPaymentMethodsSummary` (3 tests): sin órdenes no llama a
  `readGroupPosPayments`/`findPosPaymentMethods`, separa Efectivo de
  otros medios y arma el detalle por método, domain de órdenes y de
  pagos correcto.
- `src/sales/tests/mocks/odoo.service.mock.ts`: agregados los mocks
  `findPosPaymentMethods` y `readGroupPosPayments`.

## Verificación

- `npx vitest run`: 53/53 tests, sin fallos.
- `npx tsc --noEmit -p tsconfig.json`: limpio (mismo error preexistente
  de siempre en `test/app.e2e-spec.ts` por `supertest/types`, ajeno a
  este cambio).
- `npx oxlint --config oxlint.json`: sin advertencias.

## Pendiente de confirmar con el usuario

- El buscador de compradores no filtra por tienda: como usa facturas
  (`account.move`), que no tienen tienda propia, el filtro es solo por
  nombre y rango de fechas — si en algún momento se necesita filtrar
  compradores por tienda también, habría que definir primero qué
  significa "tienda" para una factura (¿la del vendedor? ¿la de las
  órdenes POS que la generaron?).
- Vale la pena que el usuario abra `/dashboard/buscar-compradores` y
  `/dashboard/efectivo-otros-medios` con `npm run dev` y confirme que los
  números cuadran contra lo que ve en Odoo.
