// Los montos de Odoo llegan con 2 decimales, pero acumularlos en JS
// arrastra el error típico de coma flotante ($74,226.86999999999). Se
// redondea a centavos, que es la precisión real del dato.
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
