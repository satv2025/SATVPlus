(() => {
  "use strict";

  /* =========================================================
     SATV+ — ACCOUNT SUPPORT
  ========================================================= */

  const DESTINATION = "support@accounts.satvplus.com.ar";

  const ENDPOINT =
    `https://formsubmit.co/ajax/${DESTINATION}`;

  /* =========================================================
     ELEMENTS
  ========================================================= */

  const form =
    document.getElementById("requestForm");

  const brandHome =
    document.getElementById("brandHome");

  const dropdown =
    document.getElementById("requestDropdown");

  const dropdownTrigger =
    dropdown.querySelector(".dropdown-trigger");

  const dropdownValue =
    dropdown.querySelector(".dropdown-value");

  const dropdownMenu =
    dropdown.querySelector(".dropdown-menu");

  const dropdownOptions = [
    ...dropdown.querySelectorAll(".dropdown-option")
  ];

  const confirmCheck =
    document.getElementById("confirmCheck");

  const submitRequest =
    document.getElementById("submitRequest");

  const formStatus =
    document.getElementById("formStatus");

  const messageCount =
    document.getElementById("messageCount");

  /* =========================================================
     STATE
  ========================================================= */

  let selectedRequest = "Eliminar cuenta";

  let confirmed = false;

  let dropdownCloseTimer = null;

  /* =========================================================
     PLACEHOLDERS
  ========================================================= */

  /*
    Importante:
    NO son presets.

    Nunca se escriben automáticamente dentro del campo.

    Solamente se muestran cuando el contenteditable
    está realmente vacío.
  */

  const PLACEHOLDERS = {
    "Eliminar cuenta": {
      subject:
        "Ej.: Quiero eliminar mi cuenta de SATV+",

      message:
        "Contanos que querés solicitar la eliminación de tu cuenta y cualquier información adicional que consideres necesaria."
    },

    "Restaurar cuenta": {
      subject:
        "Ej.: Quiero restaurar mi cuenta de SATV+",

      message:
        "Contanos qué cuenta querés restaurar y cualquier información que pueda ayudarnos a identificarla."
    },

    "Otra consulta": {
      subject:
        "Escribí brevemente el motivo de tu consulta",

      message:
        "Contanos en detalle cómo podemos ayudarte con tu cuenta de SATV+."
    }
  };

  /* =========================================================
     FIELD HELPERS
  ========================================================= */

  const getField = (name) =>
    form.querySelector(
      `[data-field="${name}"]`
    );

  const textOf = (element) => {
    if (!element) {
      return "";
    }

    return (
      element.innerText ||
      element.textContent ||
      ""
    )
      .replace(/\u00a0/g, " ")
      .replace(/\r/g, "")
      .trim();
  };

  const setText = (element, value) => {
    if (!element) {
      return;
    }

    element.textContent = value;
  };

  const setPlaceholder = (
    element,
    value
  ) => {
    if (!element) {
      return;
    }

    element.dataset.placeholder = value;
  };

  /* =========================================================
     CONTENTEDITABLE CLEANUP
  ========================================================= */

  /*
    contenteditable suele dejar:

    <br>

    o nodos de texto vacíos después de borrar.

    En ese caso CSS ya no detecta :empty.

    Esta función elimina esos residuos para que
    vuelva a aparecer automáticamente el placeholder.
  */

  function restorePlaceholderIfEmpty(element) {
    if (!element) {
      return;
    }

    const value = textOf(element);

    if (value !== "") {
      return;
    }

    /*
      Solo limpiamos si realmente no hay texto.
      Esto elimina <br>, espacios invisibles,
      divs vacíos, etc.
    */

    if (element.childNodes.length > 0) {
      element.replaceChildren();
    }
  }

  /* =========================================================
     PLACEHOLDERS AUTOMÁTICOS
  ========================================================= */

  function enableAutomaticPlaceholders() {
    const controls =
      form.querySelectorAll(
        ".text-control"
      );

    controls.forEach((control) => {
      control.addEventListener(
        "input",
        () => {
          restorePlaceholderIfEmpty(
            control
          );
        }
      );

      control.addEventListener(
        "blur",
        () => {
          restorePlaceholderIfEmpty(
            control
          );
        }
      );

      /*
        También por seguridad al pegar,
        cortar, Ctrl+A + Delete, etc.
      */

      control.addEventListener(
        "keyup",
        () => {
          restorePlaceholderIfEmpty(
            control
          );
        }
      );
    });
  }

  /* =========================================================
     APPLY CURRENT PLACEHOLDERS
  ========================================================= */

  function applyPlaceholders(
    requestType
  ) {
    const values =
      PLACEHOLDERS[requestType];

    if (!values) {
      return;
    }

    setPlaceholder(
      getField("subject"),
      values.subject
    );

    setPlaceholder(
      getField("message"),
      values.message
    );
  }

  /* =========================================================
     HOME
  ========================================================= */

  const openHome = () => {
    window.location.href = "/";
  };

  brandHome.addEventListener(
    "click",
    openHome
  );

  brandHome.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        openHome();
      }
    }
  );

  /* =========================================================
     DROPDOWN
  ========================================================= */

  function openDropdown() {
    /*
      Si estaba cerrándose y volvemos
      a abrir antes de terminar la animación.
    */

    if (dropdownCloseTimer) {
      clearTimeout(
        dropdownCloseTimer
      );

      dropdownCloseTimer = null;
    }

    /*
      Primero hacemos visible el elemento
      en DOM.
    */

    dropdownMenu.hidden = false;

    /*
      Esperamos un frame para que el navegador
      registre primero el estado cerrado.
      En el siguiente frame agregamos .open
      y así ocurre la transición.
    */

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dropdown.classList.add(
          "open"
        );
      });
    });

    dropdownTrigger.setAttribute(
      "aria-expanded",
      "true"
    );
  }

  function closeDropdown() {
    if (
      !dropdown.classList.contains(
        "open"
      ) &&
      dropdownMenu.hidden
    ) {
      return;
    }

    dropdown.classList.remove(
      "open"
    );

    dropdownTrigger.setAttribute(
      "aria-expanded",
      "false"
    );

    if (dropdownCloseTimer) {
      clearTimeout(
        dropdownCloseTimer
      );
    }

    /*
      Esperamos a que termine el reveal
      inverso antes de agregar hidden.
    */

    dropdownCloseTimer =
      setTimeout(() => {
        if (
          !dropdown.classList.contains(
            "open"
          )
        ) {
          dropdownMenu.hidden = true;
        }

        dropdownCloseTimer = null;
      }, 280);
  }

  function toggleDropdown() {
    if (
      dropdown.classList.contains(
        "open"
      )
    ) {
      closeDropdown();

      return;
    }

    openDropdown();
  }

  /* =========================================================
     SELECT REQUEST
  ========================================================= */

  function selectRequest(option) {
    selectedRequest =
      option.dataset.value;

    dropdownValue.textContent =
      selectedRequest;

    dropdownOptions.forEach(
      (item) => {
        item.classList.toggle(
          "is-selected",
          item === option
        );
      }
    );

    /*
      Al elegir otro tipo:

      NO escribimos contenido.

      Limpiamos asunto + mensaje
      y solamente cambiamos placeholders.
    */

    setText(
      getField("subject"),
      ""
    );

    setText(
      getField("message"),
      ""
    );

    applyPlaceholders(
      selectedRequest
    );

    restorePlaceholderIfEmpty(
      getField("subject")
    );

    restorePlaceholderIfEmpty(
      getField("message")
    );

    updateMessageCount();

    closeDropdown();
  }

  /* =========================================================
     DROPDOWN EVENTS
  ========================================================= */

  dropdownTrigger.addEventListener(
    "click",
    toggleDropdown
  );

  dropdownTrigger.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        toggleDropdown();
      }

      if (
        event.key === "Escape"
      ) {
        closeDropdown();
      }
    }
  );

  dropdownOptions.forEach(
    (option) => {
      option.addEventListener(
        "click",
        () => {
          selectRequest(option);
        }
      );

      option.addEventListener(
        "keydown",
        (event) => {
          if (
            event.key === "Enter" ||
            event.key === " "
          ) {
            event.preventDefault();

            selectRequest(option);
          }

          if (
            event.key === "Escape"
          ) {
            closeDropdown();

            dropdownTrigger.focus();
          }
        }
      );
    }
  );

  /* =========================================================
     CLICK OUTSIDE
  ========================================================= */

  document.addEventListener(
    "click",
    (event) => {
      if (
        !dropdown.contains(
          event.target
        )
      ) {
        closeDropdown();
      }
    }
  );

  /* =========================================================
     ESC GLOBAL
  ========================================================= */

  document.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Escape" &&
        dropdown.classList.contains(
          "open"
        )
      ) {
        closeDropdown();

        dropdownTrigger.focus();
      }
    }
  );

  /* =========================================================
     CUSTOM CHECKBOX
  ========================================================= */

  function toggleConfirmation() {
    confirmed = !confirmed;

    confirmCheck.classList.toggle(
      "is-checked",
      confirmed
    );

    confirmCheck.setAttribute(
      "aria-checked",
      confirmed
        ? "true"
        : "false"
    );
  }

  confirmCheck.addEventListener(
    "click",
    toggleConfirmation
  );

  confirmCheck.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        toggleConfirmation();
      }
    }
  );

  /* =========================================================
     MESSAGE COUNTER
  ========================================================= */

  function updateMessageCount() {
    const field =
      getField("message");

    restorePlaceholderIfEmpty(
      field
    );

    let text =
      textOf(field);

    if (
      text.length > 3000
    ) {
      text =
        text.slice(
          0,
          3000
        );

      setText(
        field,
        text
      );

      /*
        Mandamos cursor al final
        solo si hubo que recortar.
      */

      const range =
        document.createRange();

      const selection =
        window.getSelection();

      range.selectNodeContents(
        field
      );

      range.collapse(false);

      selection.removeAllRanges();

      selection.addRange(
        range
      );
    }

    messageCount.textContent =
      String(
        textOf(field).length
      );
  }

  getField("message")
    .addEventListener(
      "input",
      () => {
        restorePlaceholderIfEmpty(
          getField("message")
        );

        updateMessageCount();
      }
    );

  /* =========================================================
     EMAIL VALIDATION
  ========================================================= */

  function validEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
      value
    );
  }

  /* =========================================================
     VALIDATION
  ========================================================= */

  function validate() {
    const name =
      textOf(
        getField("name")
      );

    const email =
      textOf(
        getField("email")
      );

    const subject =
      textOf(
        getField("subject")
      );

    const message =
      textOf(
        getField("message")
      );

    if (!name) {
      return (
        "Ingresá tu nombre y apellido."
      );
    }

    if (
      !email ||
      !validEmail(email)
    ) {
      return (
        "Ingresá un email válido asociado a tu cuenta SATV+."
      );
    }

    if (!subject) {
      return (
        "Ingresá un asunto."
      );
    }

    if (!message) {
      return (
        "Escribí un mensaje para la solicitud."
      );
    }

    if (!confirmed) {
      return (
        "Confirmá que el email indicado corresponde a tu cuenta SATV+."
      );
    }

    return null;
  }

  /* =========================================================
     STATUS
  ========================================================= */

  function showStatus(
    type,
    message
  ) {
    formStatus.hidden = false;

    formStatus.className =
      `form-status ${type}`;

    formStatus.textContent =
      message;
  }

  function clearStatus() {
    formStatus.hidden = true;

    formStatus.className =
      "form-status";

    formStatus.textContent =
      "";
  }

  /* =========================================================
     LOADING
  ========================================================= */

  function setLoading(state) {
    submitRequest.classList.toggle(
      "is-loading",
      state
    );

    submitRequest
      .querySelector(
        ".submit-label"
      )
      .textContent =
        state
          ? "Enviando..."
          : "Enviar solicitud";
  }

  /* =========================================================
     RESET
  ========================================================= */

  function resetForm() {
    setText(
      getField("name"),
      ""
    );

    setText(
      getField("email"),
      ""
    );

    setText(
      getField("subject"),
      ""
    );

    setText(
      getField("message"),
      ""
    );

    selectedRequest =
      "Eliminar cuenta";

    dropdownValue.textContent =
      selectedRequest;

    dropdownOptions.forEach(
      (item) => {
        item.classList.toggle(
          "is-selected",
          item.dataset.value ===
            selectedRequest
        );
      }
    );

    applyPlaceholders(
      selectedRequest
    );

    /*
      Forzamos que todos los contenteditable
      realmente queden vacíos.
    */

    form
      .querySelectorAll(
        ".text-control"
      )
      .forEach(
        restorePlaceholderIfEmpty
      );

    confirmed = false;

    confirmCheck.classList.remove(
      "is-checked"
    );

    confirmCheck.setAttribute(
      "aria-checked",
      "false"
    );

    updateMessageCount();
  }

  /* =========================================================
     SEND
  ========================================================= */

  async function sendRequest() {
    clearStatus();

    /*
      Antes de validar limpiamos cualquier
      <br> residual.
    */

    form
      .querySelectorAll(
        ".text-control"
      )
      .forEach(
        restorePlaceholderIfEmpty
      );

    const validationError =
      validate();

    if (validationError) {
      showStatus(
        "error",
        validationError
      );

      return;
    }

    const name =
      textOf(
        getField("name")
      );

    const email =
      textOf(
        getField("email")
      );

    const subject =
      textOf(
        getField("subject")
      );

    const message =
      textOf(
        getField("message")
      );

    const payload = {
      _subject:
        `[SATV+ Accounts] ${subject}`,

      _template:
        "table",

      Aplicacion:
        "SATV+",

      Solicitud:
        selectedRequest,

      Nombre:
        name,

      email:
        email,

      Asunto:
        subject,

      Mensaje:
        message,

      "Fecha enviada":
        new Date()
          .toLocaleString(
            "es-AR"
          )
    };

    setLoading(true);

    try {
      const response =
        await fetch(
          ENDPOINT,
          {
            method:
              "POST",

            headers: {
              "Content-Type":
                "application/json",

              "Accept":
                "application/json"
            },

            body:
              JSON.stringify(
                payload
              )
          }
        );

      let result = {};

      try {
        result =
          await response.json();
      } catch (_) {
        result = {};
      }

      if (
        !response.ok ||
        result.success === false ||
        result.success === "false"
      ) {
        throw new Error(
          result.message ||
          "No se pudo enviar la solicitud."
        );
      }

      showStatus(
        "success",
        "Solicitud enviada correctamente. SATV+ Accounts recibió tu pedido."
      );

      resetForm();

    } catch (error) {
      console.error(
        error
      );

      showStatus(
        "error",
        "No pudimos enviar la solicitud en este momento. Volvé a intentarlo en unos minutos."
      );

    } finally {
      setLoading(false);
    }
  }

  /* =========================================================
     SUBMIT EVENTS
  ========================================================= */

  submitRequest.addEventListener(
    "click",
    sendRequest
  );

  submitRequest.addEventListener(
    "keydown",
    (event) => {
      if (
        event.key === "Enter" ||
        event.key === " "
      ) {
        event.preventDefault();

        sendRequest();
      }
    }
  );

  /* =========================================================
     INITIAL STATE
  ========================================================= */

  /*
    Asunto y mensaje arrancan REALMENTE vacíos.

    Lo que se ve es solamente data-placeholder.
  */

  setText(
    getField("subject"),
    ""
  );

  setText(
    getField("message"),
    ""
  );

  applyPlaceholders(
    selectedRequest
  );

  enableAutomaticPlaceholders();

  /*
    Limpiamos cualquier <br> que pueda
    haber venido escrito desde el HTML.
  */

  form
    .querySelectorAll(
      ".text-control"
    )
    .forEach(
      restorePlaceholderIfEmpty
    );

  updateMessageCount();
})();