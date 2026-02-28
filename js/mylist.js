// /js/mylist.js
import { supabase } from "./api.js";
import { getSession } from "./auth.js";
import { cardHtml, renderNav } from "./ui.js";

// Mostrar contenido de la lista del usuario
async function showMyList(profileId) {
    const { data, error } = await supabase
        .from("my_list")
        .select("content_id")
        .eq("profile_id", profileId);

    if (error) {
        console.error("Error al cargar la lista:", error);
        return;
    }

    const contentIds = data.map(item => item.content_id);

    // Ahora obtenemos los detalles de cada contenido
    const { data: contentData, error: contentError } = await supabase
        .from("content")
        .select("id, title, thumbnail_url, description")
        .in("id", contentIds);

    if (contentError) {
        console.error("Error al cargar el contenido:", contentError);
        return;
    }

    const contentHtml = contentData.map(content => {
        return cardHtml(content, `/title?title=${encodeURIComponent(content.id)}`);
    }).join("");

    document.getElementById("mylist-row").innerHTML = contentHtml;
}

// Inicialización de la página
async function init() {
    renderNav({ active: "mylist" });
    const session = await getSession();
    const userId = session?.user?.id;

    if (userId) {
        showMyList(userId);
    } else {
        console.log("Usuario no autenticado");
        // Redirigir o mostrar un mensaje de error
    }
}

document.addEventListener("DOMContentLoaded", init);