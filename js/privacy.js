(() => {
  "use strict";


  /* =========================================================
     SATV+ — PRIVACY POLICY
  ========================================================= */


  /* =========================================================
     CONFIG
  ========================================================= */

  const SUPPORT_EMAIL =
    "support@accounts.satvplus.com.ar";

  const SUPPORT_PAGE =
    "support.html";


  /* =========================================================
     ELEMENTS
  ========================================================= */

  const brandHome =
    document.getElementById(
      "brandHome"
    );

  const privacyItems = [
    ...document.querySelectorAll(
      ".privacy-item"
    )
  ];

  const privacyEmail =
    document.getElementById(
      "privacyEmail"
    );

  const privacyEmailTop =
    document.getElementById(
      "privacyEmailTop"
    );

  const supportAction =
    document.getElementById(
      "supportAction"
    );

  const accountSupportAction =
    document.getElementById(
      "accountSupportAction"
    );


  /* =========================================================
     KEYBOARD HELPER
  ========================================================= */

  function activateWithKeyboard(
    element,
    callback
  ) {

    if (!element) {
      return;
    }


    element.addEventListener(
      "keydown",
      (event) => {

        if (
          event.key !== "Enter" &&
          event.key !== " "
        ) {
          return;
        }


        event.preventDefault();

        callback();

      }
    );

  }


  /* =========================================================
     HOME
  ========================================================= */

  function openHome() {

    window.location.href = "/";

  }


  if (brandHome) {

    brandHome.addEventListener(
      "click",
      openHome
    );


    activateWithKeyboard(
      brandHome,
      openHome
    );

  }


  /* =========================================================
     ACCORDION STATE
  ========================================================= */

  function setItemState(
    item,
    open
  ) {

    if (!item) {
      return;
    }


    const trigger =
      item.querySelector(
        ".privacy-trigger"
      );

    const panel =
      item.querySelector(
        ".privacy-panel-shell"
      );


    item.classList.toggle(
      "open",
      open
    );


    if (trigger) {

      trigger.setAttribute(
        "aria-expanded",
        open
          ? "true"
          : "false"
      );

    }


    if (panel) {

      panel.setAttribute(
        "aria-hidden",
        open
          ? "false"
          : "true"
      );

    }

  }


  /* =========================================================
     TOGGLE
  ========================================================= */

  function toggleItem(
    item
  ) {

    const isOpen =
      item.classList.contains(
        "open"
      );


    setItemState(
      item,
      !isOpen
    );

  }


  /* =========================================================
     ACCORDION EVENTS
  ========================================================= */

  privacyItems.forEach(
    (item) => {

      const trigger =
        item.querySelector(
          ".privacy-trigger"
        );


      if (!trigger) {
        return;
      }


      trigger.addEventListener(
        "click",
        () => {

          toggleItem(
            item
          );

        }
      );


      activateWithKeyboard(
        trigger,
        () => {

          toggleItem(
            item
          );

        }
      );

    }
  );


  /* =========================================================
     EMAIL
  ========================================================= */

  function openPrivacyEmail() {

    const subject =
      encodeURIComponent(
        "Consulta de privacidad de SATV+"
      );


    window.location.href =
      `mailto:${SUPPORT_EMAIL}?subject=${subject}`;

  }


  if (privacyEmail) {

    privacyEmail.addEventListener(
      "click",
      openPrivacyEmail
    );


    activateWithKeyboard(
      privacyEmail,
      openPrivacyEmail
    );

  }


  if (privacyEmailTop) {

    privacyEmailTop.addEventListener(
      "click",
      openPrivacyEmail
    );


    activateWithKeyboard(
      privacyEmailTop,
      openPrivacyEmail
    );

  }


  /* =========================================================
     SUPPORT
  ========================================================= */

  function openSupport() {

    window.location.href =
      SUPPORT_PAGE;

  }


  if (supportAction) {

    supportAction.addEventListener(
      "click",
      openSupport
    );


    activateWithKeyboard(
      supportAction,
      openSupport
    );

  }


  if (accountSupportAction) {

    accountSupportAction.addEventListener(
      "click",
      openSupport
    );


    activateWithKeyboard(
      accountSupportAction,
      openSupport
    );

  }


  /* =========================================================
     INITIAL STATE
     ABSOLUTAMENTE TODO CERRADO
  ========================================================= */

  privacyItems.forEach(
    (item) => {

      setItemState(
        item,
        false
      );

    }
  );

})();