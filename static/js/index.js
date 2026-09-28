window.HELP_IMPROVE_VIDEOJS = false;

$(document).ready(function() {
    // Check for click events on the navbar burger icon
    $(".navbar-burger").click(function() {
      // Toggle the "is-active" class on both the "navbar-burger" and the "navbar-menu"
      $(".navbar-burger").toggleClass("is-active");
      $(".navbar-menu").toggleClass("is-active");
    });

    // Tabs that switch between panes: <div data-tabs> ... <li data-tab="x"> ... <div data-pane="x">
    $("[data-tabs]").each(function() {
      var group = $(this);
      group.find("[data-tab] a").click(function(e) {
        e.preventDefault();
        var key = $(this).parent().data("tab");
        group.find("[data-tab]").removeClass("is-active");
        $(this).parent().addClass("is-active");
        group.find("[data-pane]").attr("hidden", true);
        group.find("[data-pane='" + key + "']").removeAttr("hidden");
      });
    });

    bulmaSlider.attach();
})
