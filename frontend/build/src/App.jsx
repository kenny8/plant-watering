console.log('Loading App.jsx...');

if (!window.React || !window.ReactDOM || !window.AuthContext) {
  console.error('App.jsx: React, ReactDOM, or AuthContext not loaded');
  throw new Error('React, ReactDOM, or AuthContext not loaded');
}

const React = window.React;
const { useState, useEffect } = React;
const { createRoot } = window.ReactDOM;
const { AuthProvider, useAuth } = window.AuthContext;

function AppContent() {
  console.log('AppContent: Rendering');
  const { isAuthenticated } = useAuth();
  const [currentPath, setCurrentPath] = useState(window.location.pathname);
  const [isCreateBuildOpen, setIsCreateBuildOpen] = useState(false);
  const [editingBuild, setEditingBuild] = useState(null);

  useEffect(() => {
    const handlePopstate = () => {
      console.log('AppContent: Location changed to', window.location.pathname);
      setCurrentPath(window.location.pathname);
      setIsCreateBuildOpen(false); // Закрываем поп-ап при смене пути
      setEditingBuild(null); // Закрываем редактирование при смене пути
    };
    window.addEventListener('popstate', handlePopstate);
    return () => window.removeEventListener('popstate', handlePopstate);
  }, []);

  const handleAddAssembly = () => {
    console.log('AppContent: handleAddAssembly called');
    setIsCreateBuildOpen(true);
  };

  const handleEditBuild = (build) => {
    console.log('AppContent: Editing build:', build);
    setEditingBuild(build);
  };

  const handleUpdateBuild = (updatedBuild) => {
    console.log('AppContent: Build updated:', updatedBuild);
    setEditingBuild(null);
    // Можно добавить обновление состояния если нужно
  };

  if (!isAuthenticated) {
    console.log('AppContent: Rendering Login');
    return React.createElement(window.Login);
  }

const renderContent = () => {
  if (currentPath === '/devices') {
    console.log('AppContent: Rendering Devices');
    return React.createElement(window.Devices);
  } else if (currentPath === '/settings') {
    console.log('AppContent: Rendering Settings');
    return React.createElement(window.Settings);
  } else if (currentPath === '/assemblies') {
    console.log('AppContent: Rendering Assemblies');
    return React.createElement(window.Assemblies, { onEditBuild: handleEditBuild });
  } else if (currentPath.startsWith('/device-data')) {
    console.log('AppContent: Rendering DeviceData');
    return React.createElement(window.DeviceData);
  } else {
    console.log('AppContent: Rendering Home');
    return React.createElement(window.Home, { onAddAssembly: handleAddAssembly });
  }
};

  console.log('AppContent: isCreateBuildOpen:', isCreateBuildOpen);
  console.log('AppContent: editingBuild:', editingBuild);
  
  return React.createElement(
    'div',
    { className: 'flex flex-col min-h-screen' },
    React.createElement(window.Navbar),
    React.createElement('div', { className: 'flex-1' }, renderContent()),
    
    // Поп-ап для создания сборки
    isCreateBuildOpen && React.createElement(window.CreateBuild, { 
      onClose: () => {
        console.log('AppContent: Closing CreateBuild');
        setIsCreateBuildOpen(false);
      } 
    }),
    
    // Поп-ап для редактирования сборки
    editingBuild && React.createElement(window.EditBuild, { 
      buildId: editingBuild.id, 
      onClose: () => {
        console.log('AppContent: Closing EditBuild');
        setEditingBuild(null);
      },
      onUpdate: handleUpdateBuild
    })
  );
}

function App() {
  const [isReady, setIsReady] = useState(false);
  const [timeoutReached, setTimeoutReached] = useState(false);

useEffect(() => {
  const startTime = Date.now();
  const checkDependencies = () => {
    if (window.Login && window.AuthContext && window.Navbar && window.Home && 
        window.Settings && window.Devices && window.CreateBuild && window.Assemblies && 
        window.EditBuild && window.DeviceData) {  // Добавлен DeviceData
      console.log('App.jsx: All dependencies ready:', { 
        Login: window.Login, 
        AuthContext: window.AuthContext, 
        Navbar: window.Navbar, 
        Home: window.Home, 
        Settings: window.Settings, 
        Devices: window.Devices, 
        CreateBuild: window.CreateBuild,
        Assemblies: window.Assemblies,
        EditBuild: window.EditBuild,
        DeviceData: window.DeviceData  // Добавлен DeviceData
      });
      setIsReady(true);
    } else if (Date.now() - startTime > 5000) {
      console.error('App.jsx: Timeout waiting for dependencies:', { 
        Login: window.Login, 
        AuthContext: window.AuthContext, 
        Navbar: window.Navbar, 
        Home: window.Home, 
        Settings: window.Settings, 
        Devices: window.Devices, 
        CreateBuild: window.CreateBuild,
        Assemblies: window.Assemblies,
        EditBuild: window.EditBuild,
        DeviceData: window.DeviceData  // Добавлен DeviceData
      });
      setTimeoutReached(true);
    } else {
      console.log('App.jsx: Waiting for dependencies...');
      setTimeout(checkDependencies, 100);
    }
  };
  checkDependencies();
}, []);

  if (timeoutReached) {
    console.error('App.jsx: Rendering error screen');
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center min-h-screen' },
      React.createElement(
        'div',
        { className: 'text-center' },
        React.createElement('div', { className: 'text-xl mb-4 text-red-600' }, 'Error: Failed to load components'),
        React.createElement('div', { className: 'text-gray-600' }, 'Check console for details')
      )
    );
  }

  if (!isReady) {
    console.log('App.jsx: Rendering loading screen');
    return React.createElement(
      'div',
      { className: 'flex items-center justify-center min-h-screen' },
      React.createElement(
        'div',
        { className: 'text-center' },
        React.createElement('div', { className: 'text-xl mb-4' }, 'Loading application...'),
        React.createElement('div', { className: 'text-gray-600' }, 'Waiting for components to load')
      )
    );
  }

  return React.createElement(
    AuthProvider,
    null,
    React.createElement(AppContent)
  );
}

const container = document.getElementById('root');
if (container) {
  console.log('App.jsx: Container found, rendering App');
  const root = createRoot(container);
  root.render(React.createElement(App));
  console.log('App.jsx rendered successfully');
} else {
  console.error('App.jsx: Container #root not found');
}