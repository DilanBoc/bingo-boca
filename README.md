# Bingo en familia

Bingo de 75 balotas para hasta 30 personas. Una pantalla (la del anfitrión) gira la balotera y canta los números; cada jugador entra desde su celular con un QR, pone su nombre y elige de 1 a 6 cartones.

## Qué hace
- Sala con código y QR para entrar.
- Balotera con sonido y voz que canta "B, 7".
- Tablero con las 75 balotas que han salido.
- Patrones: una fila, cuatro esquinas, letra H, letra C, letra X, cartón lleno.
- Detección automática del ganador (se puede apagar). El botón ¡Bingo! siempre se verifica en el servidor contra las balotas que salieron, así que no hay trampa.
- Si un celular se cierra o pierde señal, al volver a abrir el enlace recupera sus cartones y lo que había marcado.
- Rondas nuevas sin que la gente tenga que volver a entrar.

## Puesta en marcha (todo en capa gratuita)

1. **Supabase**: crea un proyecto en supabase.com. Ve a *SQL Editor*, pega `supabase/schema.sql` y dale *Run*.
2. En *Project Settings > API* copia la URL, la `anon key` y la `service_role key`.
3. **Local**: copia `.env.example` a `.env.local`, pega los tres valores y corre:
   ```
   npm install
   npm run dev
   ```
   Abre http://localhost:3000 y crea una sala.
4. **Vercel**: sube la carpeta a un repo de GitHub, impórtalo en vercel.com y agrega las mismas tres variables de entorno. Despliega.

## Cómo se juega
1. El anfitrión abre la página en un computador o TV y toca **Crear sala**.
2. Elige cómo se gana y si quiere detección automática.
3. La familia escanea el QR, pone su nombre y elige cartones.
4. El anfitrión toca **Girar balotera**. Cada quien marca en su celular (o activa "Marcar solo").
5. Cuando hay ganador, la balotera lo anuncia. **Empezar ronda nueva** reinicia las balotas; los cartones se mantienen.

## Archivos
- `lib/bingo.js`: cartones, patrones y validación.
- `app/api/*`: crear sala, unirse, girar, cantar bingo, ajustes. Usan la service role key, que nunca llega al navegador.
- `app/host/[code]`: pantalla de la balotera.
- `app/sala/[code]`: pantalla del jugador.
