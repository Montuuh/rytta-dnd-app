# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: identity.spec.ts >> self-demotion clears management views and offline actions are not queued
- Location: tests\e2e\identity.spec.ts:191:1

# Error details

```
Test timeout of 30000ms exceeded.
```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e3]:
    - link "Saltar al contenido" [ref=e4] [cursor=pointer]:
      - /url: "#main-content"
    - complementary [ref=e5]:
      - generic [ref=e10]:
        - text: RYTTA
        - generic [ref=e11]: TU COMPAÑERO DE MESA
      - paragraph [ref=e12]: TU AVENTURA
      - navigation "Navegación principal" [ref=e13]:
        - generic [ref=e14]:
          - link "Campamento" [ref=e15] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001"
          - link "Grupo" [ref=e19] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/party"
          - paragraph [ref=e25]:
            - text: Inventario
            - generic [ref=e30]: Módulo previsto
          - paragraph [ref=e31]:
            - text: Tiendas
            - generic [ref=e36]: Módulo previsto
          - paragraph [ref=e37]:
            - text: Misiones
            - generic [ref=e41]: Módulo previsto
          - paragraph [ref=e42]:
            - text: Combate
            - generic [ref=e52]: Módulo previsto
          - paragraph [ref=e53]:
            - text: Atlas
            - generic [ref=e56]: Módulo previsto
          - paragraph [ref=e57]:
            - text: Glosario
            - generic [ref=e60]: Módulo previsto
          - paragraph [ref=e61]:
            - text: Recuerdos
            - generic [ref=e66]: Módulo previsto
          - paragraph [ref=e67]:
            - text: Bastión
            - generic [ref=e70]: Módulo previsto
          - paragraph [ref=e71]:
            - text: Taller
            - generic [ref=e75]: Módulo previsto
          - link "Miembros e invitaciones" [ref=e76] [cursor=pointer]:
            - /url: "#/campaign/20000000-0000-4000-8000-000000000001/members"
      - generic [ref=e77]: Menos cuentas.Más aventuras.
    - generic [ref=e78]:
      - banner [ref=e79]:
        - paragraph [ref=e81]: The Sunken Coast
        - generic [ref=e82]:
          - button "Vista Player" [ref=e83] [cursor=pointer]
          - button "Sesión de dm@example.com" [ref=e86] [cursor=pointer]:
            - generic [ref=e87]: dm@example.com
          - button "Abrir menú de ajustes" [ref=e94] [cursor=pointer]
      - main [ref=e97]:
        - generic [ref=e99]:
          - generic [ref=e100]:
            - heading "Tu mesa" [level=1] [ref=e101]
            - paragraph [ref=e102]: Los DMs comparten la gestión de la campaña. Las invitaciones siempre dan el rol Player.
          - generic [ref=e103]:
            - heading "Vincular personaje" [level=2] [ref=e104]
            - paragraph [ref=e105]: "Table DM: Sin personaje"
            - paragraph [ref=e106]: "Arin: Sin personaje"
            - generic [ref=e108]:
              - generic [ref=e109]:
                - paragraph [ref=e110]: Arin
                - paragraph [ref=e111]: Sin jugador
              - button "Vincular personaje" [ref=e112] [cursor=pointer]
          - region [ref=e115]:
            - generic [ref=e116]:
              - generic [ref=e117]:
                - heading "Miembros" [level=2] [ref=e118]
                - button "Actualizar" [ref=e119] [cursor=pointer]
              - generic [ref=e123]:
                - generic [ref=e124]:
                  - generic [ref=e125]:
                    - paragraph [ref=e126]: Table DM · Tú
                    - paragraph [ref=e127]: dm@example.com
                  - generic [ref=e128]: DM
                - button "Cambiar a Player" [ref=e131] [cursor=pointer]
              - generic [ref=e135]:
                - generic [ref=e136]:
                  - generic [ref=e137]:
                    - paragraph [ref=e138]: Arin
                    - paragraph [ref=e139]: player@example.com
                  - generic [ref=e140]: DM
                - generic [ref=e142]:
                  - button "Cambiar a Player" [ref=e143] [cursor=pointer]
                  - button "Retirar miembro" [ref=e146] [cursor=pointer]
          - region [ref=e149]:
            - generic [ref=e150]:
              - heading "Invitaciones pendientes" [level=2] [ref=e151]
              - paragraph [ref=e152]: No hay invitaciones pendientes para esta campaña.
          - button "Abandonar campaña" [ref=e155] [cursor=pointer]
      - contentinfo [ref=e158]: Para quienes comparten tu mesa.
  - dialog [ref=e160]:
    - banner [ref=e161]:
      - heading "Vincular personaje" [level=2] [ref=e162]
      - button "Cancelar" [ref=e163] [cursor=pointer]
    - generic [ref=e167]:
      - paragraph [ref=e168]: Arin
      - generic [ref=e169]:
        - generic [ref=e170]: Jugador existente
        - combobox "Jugador existente" [ref=e172] [cursor=pointer]:
          - option "Jugador existente" [selected]
      - paragraph [ref=e173]: Invita un correo de Google a este personaje. Se acepta desde Mi cuenta. No se envía un email. Una nueva invitación cancela la anterior.
      - generic [ref=e174]:
        - generic [ref=e175]: Correo de la cuenta de Google
        - textbox "Correo de la cuenta de Google" [ref=e177]: offline@example.com
      - alert [ref=e178]:
        - generic [ref=e179]: No se pudo completar la acción. Actualiza y revisa el personaje, la asignación y la conexión antes de reintentar.
      - generic [ref=e182]:
        - button "Cancelar" [ref=e183] [cursor=pointer]
        - button "Invitar jugador" [active] [ref=e186] [cursor=pointer]
```
