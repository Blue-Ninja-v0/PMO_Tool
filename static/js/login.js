const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const container = document.getElementById('container');

signUpButton.addEventListener('click', () => {
    container.classList.add("right-panel-active");
});

signInButton.addEventListener('click', () => {
    container.classList.remove("right-panel-active");
});

// // Get the form element
// const form = document.getElementById('signInForm');
//
// // Add an event listener for form submission
// form.addEventListener('submit', function (event) {
//     // Prevent the default form submission behavior
//     event.preventDefault();
//
//
// });

document.addEventListener('DOMContentLoaded', function() {

// JavaScript to handle signup and login
    document.getElementById('signUpForm').addEventListener('submit', async function (event) {
        event.preventDefault(); // Prevent the default form submission

        console.log("values")

        const username = document.getElementById('signupName').value;
        const email = document.getElementById('signupEmail').value;
        const password = document.getElementById('signupPassword').value;

        // Send signup request
        try {
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({username, email, password})
            });
            const data = await response.json();
            if (response.ok) {
                alert('Signup successful! Please log in.');
                window.location.reload();
            } else {
                alert(`Signup failed: ${data.error}`);
                window.location.reload();

            }
        } catch (error) {
            console.error('Error during signup:', error);
            alert('Error during signup. Please try again.');
        }
    });

    document.getElementById('signInForm').addEventListener('submit', async function (event) {
        event.preventDefault(); // Prevent the default form submission
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        // Send login request
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({email, password})
            });
            const data = await response.json();
            if (response.ok) {
                console.log("data =", data)
                alert('Login successful!');
                sessionStorage.setItem('loggedIn', 'true');
                sessionStorage.setItem('token', data);
                window.location.href = "/"
            } else {
                alert(`Login failed: ${data}`);
            }
        } catch (error) {
            console.error('Error during login:', error);
            alert('Error during login. Please try again.');
        }
    });
})