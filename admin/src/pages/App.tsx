import { Page } from '@strapi/strapi/admin';
import { Routes, Route } from 'react-router-dom';

import { HomePage } from './HomePage';
import { RedirectImportPage } from './RedirectImportPage';

const App = () => {
  return (
    <Routes>
      <Route index element={<HomePage />} />
      <Route path="redirects/import" element={<RedirectImportPage />} />
      <Route path="*" element={<Page.Error />} />
    </Routes>
  );
};

export default App;
