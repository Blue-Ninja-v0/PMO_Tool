document.addEventListener('DOMContentLoaded', function() {
    var menuButton = document.getElementById('menu-button');
    var sideMenu = document.getElementById('side-menu');
    var closeBtn = document.querySelector('.closebtn');

    menuButton.addEventListener('click', function(e) {
        e.preventDefault();
        if (sideMenu.style.width === '250px') {
            sideMenu.style.width = '0';
        } else {
            sideMenu.style.width = '250px';
        }
    });

    closeBtn.addEventListener('click', function() {
        sideMenu.style.width = '0';
    });

    // Close the side menu if the user clicks outside of it
    document.addEventListener('click', function(e) {
        if (e.target !== menuButton && !sideMenu.contains(e.target) && sideMenu.style.width === '250px') {
            sideMenu.style.width = '0';
        }
    });
});
