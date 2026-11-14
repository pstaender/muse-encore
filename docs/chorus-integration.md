# Integración con Chorus (OSAP)

Chorus embebe MuseEncore en `/muse/?url=<mxl>` y OSAP usa `/muse-viewer/?url=<mxl>`
para reproducción. Esta nota describe el puente mínimo que hemos añadido y lo que nos
gustaría acordar con el mantenimiento de MuseEncore.

## Contrato actual

Implementado en `editor/chorusBridge.ts` (se carga desde `editor/main.tsx`):

- Al arrancar, el iframe envía al padre `{ type: "chorus:ready" }`.
- El padre puede enviar al iframe:
  - `{ type: "chorus:ping" }` → responde `chorus:ready`.
  - `{ type: "chorus:request-export" }` → exporta la partitura actual a `.mxl`.
- El iframe responde:
  - `{ type: "chorus:score", fileName: string, data: Uint8Array }`
  - `{ type: "chorus:error", message: string }`

La exportación usa el `ExportDialogModel` existente (`selectExportTypeById("mxl")` y
`exportScores()`). No hay tokens, URLs de Chorus ni acceso a red en el puente.

## Lo que pedimos al desarrollador

1. **Revisar el puente** y decidir si se acepta como API de integración oficial
   (`window.musescore` o eventos documentados), o si preferís que quede detrás de un
   feature flag/plugin.
2. **Mantener estable `?url=`** y añadir un **modo visor** (`?mode=viewer`) que oculte
   herramientas de edición y conserve reproducción, cursor y páginas. Hoy OSAP y la
   previsualización de Chorus abren el editor completo.
3. **Documentar y probar** los eventos `chorus:*`, el tipo de `data` y la validación de
   `event.origin`; evitar cambios incompatible en el contrato.
4. **Móvil/Android**: barra compacta, controles táctiles y reproducción estable; queremos
   probarlo en dispositivo real antes de prometerlo.
5. **No romper `?url=`**: lo usan Chorus, OSAP y enlaces existentes.

## Preguntas

- ¿Preferís que el puente viva en el repositorio principal o como plugin/adaptador?
- ¿Qué nombre y forma prefieres para el contrato (`chorus:*`, `musescore:*`, API global)?
- ¿El modo visor debe ser una ruta/build separada o un parámetro del editor?
- ¿Hay restricciones de licencia/marca para publicar el visor en `/muse-viewer/`?

No queremos mantener un fork profundo: los cambios son pequeños y se pueden upstreamear.
