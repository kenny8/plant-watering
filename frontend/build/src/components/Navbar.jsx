console.log('Loading Navbar.jsx...');

if (!window.React || !window.AuthContext) {
  console.error('Navbar.jsx: React or AuthContext not loaded');
  throw new Error('React or AuthContext not loaded');
}

const React = window.React;
const { useAuth } = window.AuthContext;

function Navbar() {
  console.log('Navbar.jsx: Rendering');
  const { logout } = useAuth();

  const handleHomeClick = () => {
    console.log('Navbar: Home button clicked');
    window.history.pushState({}, '', '/');
    window.dispatchEvent(new Event('popstate'));
  };

  const handleAssembliesClick = () => {
	console.log('Navbar: Assemblies button clicked');
	window.history.pushState({}, '', '/assemblies');
	window.dispatchEvent(new Event('popstate'));
  };

  const handleDevicesClick = () => {
    console.log('Navbar: Devices button clicked');
    window.history.pushState({}, '', '/devices');
    window.dispatchEvent(new Event('popstate'));
  };

  const handleSettingsClick = () => {
    console.log('Navbar: Settings button clicked');
    window.history.pushState({}, '', '/settings');
    window.dispatchEvent(new Event('popstate'));
  };

  const handleLogoutClick = () => {
    console.log('Navbar: Logout button clicked');
    logout();
  };

  return React.createElement(
    'nav',
    { className: 'bg-blue-600 text-white p-4 shadow-md' },
    React.createElement(
      'div',
      { className: 'container mx-auto flex justify-between items-center' },
      React.createElement(
        'div',
        { className: 'text-lg font-bold' },
        'Plant Watering'
      ),
      React.createElement(
        'div',
        { className: 'flex space-x-4' },
        React.createElement(
          'button',
          {
            onClick: handleHomeClick,
            className: 'px-3 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Главная'
        ),
        React.createElement(
          'button',
          {
            onClick: handleAssembliesClick,
            className: 'px-3 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Сборки'
        ),
        React.createElement(
          'button',
          {
            onClick: handleDevicesClick,
            className: 'px-3 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Устройства'
        ),
        React.createElement(
          'button',
          {
            onClick: handleSettingsClick,
            className: 'px-3 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Настройки'
        ),
        React.createElement(
          'button',
          {
            onClick: handleLogoutClick,
            className: 'px-3 py-2 rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500'
          },
          'Выход'
        )
      )
    )
  );
}

window.Navbar = Navbar;
console.log('Navbar.jsx: Navbar exported:', window.Navbar);