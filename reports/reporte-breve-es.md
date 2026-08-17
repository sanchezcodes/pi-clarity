# Reporte breve: cómo llegamos a Pi Clarity y qué aprendimos

## Resumen

Pi Clarity nació de una evaluación práctica de varias instrucciones de presentación para Pi. Los datos sí sirvieron: permitieron descartar la idea de usar un único prompt para todos los modelos y justificaron una extensión que selecciona el contrato según el modelo activo. La conclusión es útil para este entorno, aunque sigue siendo evidencia exploratoria y no una demostración universal.

La configuración elegida es:

- `gpt-5.6-sol` → `prompts/strong.md`
- `claude-opus-5` → `prompts/balanced.md`
- modelos desconocidos → `prompts/balanced.md` como fallback conservador

## Qué hicimos

Primero investigamos métodos para evaluar claridad sin confundirla con corrección. A partir de esa investigación definimos una rúbrica, varios prompts candidatos y reglas de aceptación antes de mirar los resultados. Los documentos principales son `research/evaluation-methods.md`, `research/rubric.md` y `reports/preregistration.md`.

Después construimos 24 casos bilingües: 12 en inglés y 12 en español. Cubren respuestas breves, explicaciones técnicas, análisis largos, código, debugging, arquitectura, uso de tools, ambigüedad y elección de representaciones como listas, tablas o diagramas. Los casos se mantuvieron independientes del texto de los prompts candidatos para reducir el riesgo de favorecer una variante por construcción.

Comparamos `minimal`, `balanced` y `strong` contra un `control` sin instrucciones añadidas. La primera etapa generó 384 respuestas y realizó 576 evaluaciones ciegas por pares. Cada par se presentó en los dos órdenes posibles y solo contamos preferencias consistentes al invertir A/B, lo que reduce el sesgo de posición.

La evaluación aplicó primero hard gates de corrección y task completion. Una respuesta más legible no podía compensar un error, una tarea incompleta o una afirmación falsa sobre uso de tools. También medimos tokens, tiempo, fidelidad de idioma y conservación de profundidad en respuestas largas.

Tras la primera etapa diseñamos `refined`, una variante que intentaba conservar los beneficios de `strong` sin sus regresiones. Generamos 192 respuestas adicionales y alcanzamos 154 evaluaciones nuevas antes de detener el proceso para proteger la cuota disponible. Esta ronda fue deliberadamente marcada como iterativa porque reutilizó casos que ya habían informado el diseño del prompt.

Por último implementamos `extensions/clarity.ts`. La extensión añade el contrato antes de cada ejecución, no modifica la respuesta después de generada y no hace llamadas adicionales a otros modelos. También ofrece `/clarity status`, `/clarity on` y `/clarity off`, con estado por sesión.

## Hipótesis y respuestas

| Hipótesis                                                                        | Resultado                                | Evidencia principal                                                                                                                                                                                                |
| -------------------------------------------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| H1. Un contrato de presentación puede mejorar la claridad frente al control.     | **Apoyada, con reservas.**               | `strong` obtuvo una preferencia ajustada por empates de **0.678** en el conjunto de resultados válidos; `balanced` obtuvo **0.622**. Un valor de 0.50 representa neutralidad.                                      |
| H2. Existe un único prompt que funciona bien para ambos modelos y ambos idiomas. | **No apoyada.**                          | Ninguna variante pasó todos los gates en todas las combinaciones de modelo e idioma. `strong` fue mejor en claridad, pero tuvo una regresión de corrección/completitud en Opus en español.                         |
| H3. Un prompt más fuerte o detallado siempre produce mejores resultados.         | **Refutada por estos datos.**            | `strong` mejoró la preferencia general, pero también introdujo regresiones de profundidad y task completion en algunas celdas. Más instrucciones no equivalen automáticamente a una respuesta mejor.               |
| H4. El efecto depende del modelo y del idioma.                                   | **Apoyada.**                             | `balanced` fue prácticamente neutral en inglés (**0.469**) y claramente favorable en español (**0.738**). `strong` funcionó bien en GPT, pero no fue seguro para Opus en español.                                  |
| H5. Podemos mejorar la presentación sin aumentar sistemáticamente la latencia.   | **Apoyada de forma operativa.**          | Ningún candidato de la primera etapa produjo un aumento sistemático de la mediana de latencia. La variación del provider sigue siendo demasiado alta para afirmar que el contrato acelera las respuestas.          |
| H6. La variante `refined` puede reemplazar a todos los prompts anteriores.       | **No apoyada.**                          | En la muestra parcial obtuvo **0.875** en Opus, pero solo **0.421** en GPT. El resultado reforzó la necesidad de selección por modelo en lugar de un contrato universal.                                           |
| H7. Una estrategia model-aware es mejor que un único fallback global.            | **Apoyada como decisión de ingeniería.** | Permite usar `strong` donde mostró la mejor señal y `balanced` donde fue más conservador. Evita aceptar de forma innecesaria la regresión de Opus en español o la falta de mejora de GPT en inglés con `balanced`. |

## Para qué sirven los datos

Los datos sirven principalmente para tomar una decisión de producto con trazabilidad. No solo muestran qué prompt recibió más preferencias; también muestran dónde una mejora aparente de claridad podía dañar corrección, profundidad o task completion. Esa diferencia fue la razón central para construir una extensión model-aware en vez de copiar un único texto a `APPEND_SYSTEM.md`.

También sirven para descartar alternativas. `minimal` no aportó una mejora suficientemente clara y redujo profundidad en varias combinaciones. `refined` mostró que una corrección razonable para Opus podía empeorar el comportamiento de GPT, lo que es evidencia adicional contra la universalidad del prompt.

El experimento también produjo infraestructura reutilizable. El harness conserva outputs crudos, metadata, uso de tokens, tiempos, tool calls y juicios ciegos; además permite repetir análisis con reglas corregidas. Durante el trabajo detectamos que la primera versión del judge no atribuía ciertos flags a A o B, corregimos el schema de forma prospectiva y mantuvimos los datos anteriores como audit-only en vez de reescribirlos.

## Qué no podemos afirmar

No podemos decir que Pi Clarity esté “científicamente probado” para cualquier modelo, tarea o usuario. La evaluación usó dos modelos, 24 casos y judges basados en modelos de lenguaje; además, la ronda `refined` reutilizó casos y quedó incompleta. Los intervalos son amplios y no hubo una evaluación humana formal con lectores finales.

Tampoco podemos atribuir cada mejora a una frase concreta del contrato. Los resultados comparan prompts completos, por lo que no aíslan el efecto de “answer first”, headings, lenguaje claro o elección de formato. Para responder esa pregunta haría falta un estudio de ablación, es decir, retirar una regla por vez y volver a medir.

## Conclusión

La evidencia no demuestra que exista un prompt universal de claridad. Sí apoya una conclusión más concreta: las instrucciones de presentación pueden mejorar las respuestas, pero su efecto cambia según el modelo y el idioma, y una regla demasiado fuerte puede interferir con el contenido. Pi Clarity aplica esa conclusión mediante una selección pequeña, reversible y model-aware.

El siguiente paso útil sería una evaluación confirmatoria con casos nuevos que no hayan participado en el diseño, al menos dos judges calibrados y una revisión humana ciega. Hasta entonces, la extensión debe considerarse una decisión de ingeniería respaldada por evidencia exploratoria, no una ley general sobre cómo responden los modelos.
