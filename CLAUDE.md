# CLAUDE.md

Este archivo proporciona lineamientos para Claude Code (claude.ai/code) al trabajar sobre este repositorio.

## Reglas

- Nunca incluir "Co-Authored-By", "Anthropic", "Claude" o "Claude Code" en mensajes de commit ni en ninguna salida relacionada con Git.
- Cada vez que completes un task, muestra un emoji de cohete 🚀 al final del mensaje.
- No releer ni listar automáticamente el contenido de `plan-history/` al iniciar una tarea — solo consultarla si el usuario lo pide explícitamente.

---

# Descripción del Proyecto

Xocolatísimo API es una API REST desarrollada con NestJS para el panel administrativo interno de Xocolatísimo (empresa de chocolate).

La plataforma es 100% empresarial: expone reportes, gráficas y números del negocio (principalmente un **módulo de ventas**) a dos roles internos, `SUPER_ADMIN` y `FINANZAS`. La fuente de verdad del dato de negocio (ventas, productos, clientes, etc.) es **Odoo** — esta API se autentica contra Odoo con un API key y expone esa información ya adaptada al frontend, en vez de duplicar la lógica de negocio de Odoo aquí.

La base de datos propia (MongoDB vía Prisma) existe principalmente para autenticación/usuarios; no es la fuente de verdad del dato de negocio.


---

# Tecnologías

Runtime

Node.js v22+

Framework

NestJS v11

Lenguaje

TypeScript

Base de Datos

MongoDB

ORM

Prisma ORM

Autenticación

JWT

Documentación

Swagger

Origen de datos de negocio

Odoo (API key)

---

# Arquitectura

La API debe seguir una arquitectura modular.

Cada módulo debe seguir la siguiente estructura:

```
src/<module>/
  controllers/     # Endpoints HTTP
  services/        # Lógica de negocio
  repositories/    # Acceso a datos
  dto/             # DTOs de entrada
  doc/             # Serialización de respuestas
  enums/           # Enumeraciones
  types/           # Interfaces
  builders/        # Builders
  strategies/       # Estrategias
  tests/
    *.spec.ts
    mocks/
```

---

# Módulos del Proyecto

```
Auth
Users
Sales          # Módulo de ventas — consume Odoo vía OdooModule, expone reportes/listados al frontend
Odoo           # Integración: cliente HTTP hacia Odoo (API key), mapeo de sus respuestas a los DTOs propios
Dashboard      # KPIs/agregados para las gráficas del panel (Recharts en el frontend)
```

---

# Estructura de Carpetas

Siempre seguir la estructura modular.

No mezclar lógica entre módulos.

Cada módulo debe ser independiente.

---

# Repository Pattern

Siempre utilizar Repository Pattern.

Los repositorios serán responsables únicamente del acceso a datos (tanto Prisma/MongoDB como, para el módulo `Odoo`, la llamada HTTP hacia Odoo — encapsulada igual que cualquier otro acceso a datos).

Los Services contendrán toda la lógica de negocio.

Nunca acceder a Prisma directamente desde los Controllers.

Nunca llamar a Odoo directamente desde un Controller o desde otro módulo que no sea `Sales`/`Dashboard` a través del `OdooModule` — todo el acceso a Odoo pasa por ahí, igual que Prisma pasa siempre por un repositorio.

Los Controllers únicamente deberán:

- Validar entrada
- Llamar al Service
- Transformar respuesta

---

# Dependency Injection

Utilizar siempre Dependency Injection de NestJS.

Evitar crear instancias manuales.

---

# DTO

Toda petición deberá validarse utilizando:

- class-validator
- class-transformer

Nunca recibir objetos sin validar.

---

# Responses

Todas las respuestas deberán mantener una estructura uniforme.

Ejemplo

```json
{
    "status": "success",
    "message": "Operación realizada correctamente.",
    "data": {}
}
```

Para errores

```json
{
    "status": "error",
    "message": "Descripción del error."
}
```

---

# Documentación

Siempre documentar los endpoints utilizando Swagger.

Utilizar:

- ApiTags
- ApiOperation
- ApiResponse
- ApiBearerAuth
- ApiQuery
- ApiParam

---

# Autenticación

La autenticación utilizará JWT.

Existirán únicamente dos roles.

- SUPER_ADMIN
- FINANZAS

**No existe endpoint público de registro.** El rol se asigna **solo en la base de datos** — nunca a través de un campo que el propio usuario controle en un formulario o request. Si se agrega un endpoint para que `SUPER_ADMIN` cree usuarios, ese endpoint puede crear la cuenta pero no debe permitir que quien la crea (ni quien se autentica después) cambie su propio rol.

Decoradores disponibles

@Public()

@Roles()

@User()

El AuthGuard será aplicado globalmente.

---

# Autorización

Cada endpoint deberá validar correctamente el rol del usuario.

`SUPER_ADMIN` puede administrar todo el sistema (usuarios, configuración, y todos los módulos de negocio).

`FINANZAS` únicamente puede acceder a los recursos de ventas/reportes/finanzas — nunca a administración de usuarios ni configuración del sistema.

---

# Base de Datos

MongoDB mediante Prisma ORM. Se usa para autenticación y configuración —
nunca para duplicar el dato de negocio de Odoo (ver "Integraciones
Externas").

Colecciones principales

- users
- Colección de configuración de Odoo (nombre exacto por definir): guarda el
  API key vigente y su duración/expiración (en días). `SUPER_ADMIN` la
  administra desde el panel — nunca se hardcodea ni vive en variables de
  entorno. El módulo `Odoo` la consulta para saber qué key usar en cada
  llamada, y debe manejar el caso de key vencida/ausente (ej. 424/502
  propio en vez de dejar pasar el error crudo de Odoo).

> TODO: estructura exacta de esta colección (nombres de campo, si guarda
> historial de keys anteriores, etc.) pendiente de definir.

---

# Integraciones Externas

Odoo

- Fuente única de la información de negocio (ventas, productos, clientes, etc.).
- Autenticación vía API key — la key **no** vive en variables de entorno:
  se guarda en Mongo (ver "Base de Datos") junto con su duración, y
  `SUPER_ADMIN` puede rotarla desde el panel sin necesitar un redeploy.
  `ODOO_BASE_URL` y `ODOO_DB` sí son variables de entorno (son de
  infraestructura, no algo que el admin rote seguido).
- Todo el acceso pasa por el módulo `Odoo` (ver "Repository Pattern"); el resto de la API nunca llama a Odoo directamente.
- Mapear siempre la respuesta de Odoo a los DTOs/tipos propios de esta API antes de exponerla — el frontend nunca debe depender de la forma exacta en que Odoo estructura sus datos.

SMTP

- Recuperación de contraseña (si el proyecto la mantiene — ver "Recuperación de Contraseña").


---

# Recuperación de Contraseña

El flujo será:

Correo

↓

Generar código temporal

↓

Enviar correo

↓

Validar código

↓

Cambiar contraseña

Los códigos deberán:

- Expirar
- Ser de un solo uso

---

# Paginación

Toda consulta que devuelva listas deberá soportar:

page

limit

search

sort

Y, donde aplique (ej. ventas), filtros de rango de fecha.

---

# Código

Utilizar:

- PascalCase para clases.
- camelCase para variables y funciones.
- kebab-case para archivos.
- UPPER_CASE para constantes.

Evitar nombres ambiguos.

---

# Estilo de Código

Siempre utilizar:

- class-transformer
- class-validator

Evitar any.

Mantener el código completamente tipado.

Utilizar interfaces cuando sea necesario.

Preferir enums antes que strings literales.

---

# Buenas Prácticas

Aplicar siempre:

- SOLID
- DRY
- KISS
- Clean Architecture
- Repository Pattern
- Separation of Concerns
- Single Responsibility
- Dependency Injection
- High Cohesion
- Low Coupling

Nunca colocar lógica de negocio en Controllers.

Nunca acceder a Prisma directamente desde Controllers.

Nunca llamar a Odoo directamente fuera del módulo `Odoo`.

Nunca duplicar lógica.

Nunca duplicar DTOs.

Nunca duplicar validaciones.

Reutilizar componentes, DTOs y utilidades siempre que sea posible.

---

# Manejo de Errores

Nunca retornar errores sin controlar.

Utilizar:

- BadRequestException
- UnauthorizedException
- ForbiddenException
- NotFoundException
- ConflictException
- InternalServerErrorException

Registrar errores cuando sea necesario, incluyendo fallos de la integración con Odoo (timeout, 401/403 del API key, respuesta inesperada) — nunca dejar que un error de Odoo se propague sin traducir al formato de respuesta uniforme de esta API.

---

# Prisma

Siempre ejecutar:

npx prisma generate

después de modificar el schema.prisma.

Nunca acceder al cliente Prisma sin utilizar el Repository correspondiente.

---

# Convenciones

Siempre utilizar class-transformer para serializar respuestas.

Mantener separación de responsabilidades.

Mantener alta cohesión y bajo acoplamiento.

No generar archivos excesivamente grandes.

Si un Service supera aproximadamente las 300-400 líneas, evaluar dividir la lógica en servicios auxiliares o estrategias.

Preferir composición sobre herencia.

Antes de crear un nuevo Service, Repository, DTO o utilidad, verificar si ya existe uno reutilizable.

Toda nueva funcionalidad debe mantener consistencia con la arquitectura existente.

Siempre pensar en escalabilidad, mantenibilidad y reutilización antes de implementar una solución.