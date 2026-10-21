// Orden del listado de Tickets → Órdenes. Cada valor se traduce a un
// `order` de search_read en PosTicketsService.
export enum PosTicketSort {
  DATE_DESC = 'date_desc',
  DATE_ASC = 'date_asc',
  AMOUNT_DESC = 'amount_desc',
  AMOUNT_ASC = 'amount_asc',
}
