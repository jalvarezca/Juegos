# Juegos

Juegos para el navegador, en HTML estático. La raíz del repositorio es el sitio (por ejemplo, GitHub Pages): `index.html` es el menú y cada juego vive en su propia carpeta.

## Estructura

```
index.html           Menú de juegos
michis/index.html    Michis: un gato por color
sudoku/index.html    Sudoku
dulces/index.html    Dulces: junta tres iguales
canonazo/index.html  Cañonazo: revienta las bolas
reino/               Reino: construye y defiende (index.html y sus scripts)
pulso-neon/          Pulso Neón: salta al ritmo de la música (index.html, sus scripts y herramientas/ para verificar los niveles)
enjambre/            Enjambre: defiende el planeta del enjambre alienígena (index.html, sus scripts y herramientas/ con pruebas y un bot de dificultad)
```

Los archivos de un juego (imágenes, sonidos, scripts) van dentro de su carpeta y se referencian con rutas relativas a esa carpeta.

## Cómo añadir un juego

1. Crea una carpeta en la raíz con el nombre del juego en kebab-case, por ejemplo `memoria/`.
2. Pon el juego en `memoria/index.html`.
3. Si quieres volver al menú, añade un enlace a la carpeta padre:

   ```html
   <a href="../">Volver al menú</a>
   ```

4. Registra el juego en el array `GAMES` de `index.html` (hay un comentario junto a la lista):

   ```js
   {
     title: "Memoria",
     description: "Encuentra las parejas.",
     folder: "memoria",
     emoji: "🃏"
   }
   ```

   - `title`: nombre de la tarjeta.
   - `description`: una frase corta.
   - `folder`: nombre de la carpeta, sin barras.
   - `emoji`: icono de la tarjeta.

   El menú está en español, inglés y francés. `title` y `description` pueden ser un texto o un objeto con un texto por idioma; si falta un idioma, se usa el español:

   ```js
   title: { es: "Memoria", en: "Memory", fr: "Mémoire" },
   description: { es: "Encuentra las parejas.", en: "Find the pairs.", fr: "Trouve les paires." }
   ```

El menú pinta una tarjeta por entrada y enlaza a `./<folder>/`.

## Publicar en Render

El archivo `render.yaml` publica el repositorio como sitio estático en [Render](https://render.com). En Render, elige **New → Blueprint**, conecta tu cuenta de GitHub y selecciona este repositorio (en **Blueprint Path**, `render.yaml`). No hay paso de compilación: Render publica los archivos tal cual.

Hay dos entornos, cada uno con su propia dirección:

- **UAT** (`juegos-uat`): se publica desde la rama `uat`, para las pruebas de aceptación.
- **Producción** (`juegos`): se publica desde la rama `main`.

Los cambios entran primero en `uat` con un pull request. Cuando se han probado en el sitio de UAT, otro pull request de `uat` a `main` los lleva a producción.

## Juegos

- **Michis** (`michis/`): coloca un gato en cada color, uno por fila y columna, sin que se toquen.
- **Sudoku** (`sudoku/`): completa la cuadrícula de 9×9 con los números del 1 al 9.
- **Dulces** (`dulces/`): junta tres o más dulces iguales. Con 4 en línea, una L o una T, o 5 en línea consigues dulces especiales. Tiene 20 niveles con objetivos de puntos, gelatina o dulces que recoger, y se juega deslizando, tocando o con el teclado.
- **Cañonazo** (`canonazo/`): mueve el cañón, que dispara solo, y revienta las bolas que rebotan; cada una se parte en dos al llegar a cero. Con las monedas se mejoran la potencia, la cadencia, los cañones, el imán y el escudo. Se juega con el ratón, el dedo o el teclado.
- **Reino** (`reino/`): juego de estrategia para un jugador inspirado en Kingshot. Mejora los edificios para subir el Centro urbano, produce pan, madera, piedra, hierro y oro (también con la página cerrada), entrena infantería, caballería y arqueros, recluta y mejora héroes, investiga en la Academia, defiende el pueblo en tiempo real moviendo al gobernador entre torres, lucha en la expedición, ataca rebeldes y recolecta en el mapa, caza al oso con la alianza y completa misiones. La lógica está en `motor.js`, `defensa.js` y `datos.js`, la interfaz en `interfaz.js` y `textos.js`, y las ilustraciones (edificios, héroes y mapa, dibujados en SVG) en `arte.js`.
- **Enjambre** (`enjambre/`): un enjambre alienígena desciende sobre el planeta y hay que abatirlo antes de que llegue a tu nave. Cada oleada trae una formación distinta (cuña, muralla, rombo, tablero, alas), con alienígenas acorazados cada vez más frecuentes, un platillo de bonificación y, cada cinco oleadas, la reina del enjambre. Hay mejoras de disparo rápido, disparo triple, escudo y vida extra, un multiplicador por aciertos seguidos y barreras que se van desgastando. Se juega con teclado, ratón, el dedo (arrastre relativo con disparo automático) o mando. La lógica está en `motor.js`, el arte vectorial en `arte.js`, el sonido sintetizado en `sonido.js` y la interfaz en `juego.js`.
