# Juegos

Juegos para el navegador, en HTML estático. La raíz del repositorio es el sitio (por ejemplo, GitHub Pages): `index.html` es el menú y cada juego vive en su propia carpeta.

## Estructura

```
index.html           Menú de juegos
michis/index.html    Michis: un gato por color
sudoku/index.html    Sudoku
dulces/index.html    Dulces: junta tres iguales
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

El menú pinta una tarjeta por entrada y enlaza a `./<folder>/`.

## Juegos

- **Michis** (`michis/`): coloca un gato en cada color, uno por fila y columna, sin que se toquen.
- **Sudoku** (`sudoku/`): completa la cuadrícula de 9×9 con los números del 1 al 9.
- **Dulces** (`dulces/`): junta tres o más dulces iguales. Con 4 en línea, una L o una T, o 5 en línea consigues dulces especiales. Tiene 20 niveles con objetivos de puntos, gelatina o dulces que recoger, y se juega deslizando, tocando o con el teclado.
