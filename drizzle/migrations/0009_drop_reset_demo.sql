-- reset_demo() recargaba los datos de ejemplo de la demo original. El producto
-- ya no usa esos datos (las tablas de negocio se vaciaron a proposito), asi que
-- la funcion no hacia falta y solo quedaba como puerta trasera: anybody con el
-- service role podia pasar por encima de la auditoria borrando el registro de
-- actividad. Se elimina junto al boton "Reiniciar demo".
drop function if exists public.reset_demo();