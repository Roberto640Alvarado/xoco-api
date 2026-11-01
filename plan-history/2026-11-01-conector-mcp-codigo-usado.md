# Conector MCP: "El código ya se usó" y logo del conector

## Objetivo
Que Claude.ai termine de conectar Xoco después de iniciar sesión, y que el conector muestre el logo.

## Cambios realizados
- `OAuthRepository.consumeCode` / `revokeRefreshToken`: buscan `usedAt`/`revokedAt` "null o ausente" (`isSet: false`).
- Nuevo `BrandIconController`: `/favicon.ico`, `/icon.png`, `/apple-touch-icon.png` con el ícono de xoco-app.

## Razones
En MongoDB un campo que nunca se guardó no coincide con `null`; el `updateMany` no encontraba el código y el canje respondía siempre "El código ya se usó". Reproducido con un flujo OAuth real contra producción. La API daba 404 en `/favicon.ico`, por eso no había ícono.

## Resultado final
El canje de código y la rotación del refresh token funcionan; el conector tiene ícono.
