import redirectImportRoute from './redirect-import';

export default () => ({
  type: 'admin',
  routes: [redirectImportRoute],
});
