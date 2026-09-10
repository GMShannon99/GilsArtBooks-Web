(function () {
  "use strict";

  var grid = document.getElementById("cover-grid");
  if (!grid || !window.VOLUMES) return;

  window.VOLUMES.forEach(function (vol) {
    var link = document.createElement("a");
    link.className = "cover-card";
    link.href = "book.html?vol=" + vol.id.replace("vol", "");

    var img = document.createElement("img");
    img.src = vol.dir + "/" + vol.cover;
    img.alt = vol.title + " cover";
    img.loading = "lazy";
    link.appendChild(img);

    var label = document.createElement("div");
    label.className = "cover-label";
    label.textContent = vol.title;
    link.appendChild(label);

    grid.appendChild(link);
  });
})();
