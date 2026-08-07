import { Box, Main, Typography } from '@strapi/design-system';

import { RedirectImportForm } from '../components/RedirectImportForm';

const RedirectImportPage = () => {
  return (
    <Main>
      <Box padding={8}>
        <Typography variant="alpha" tag="h1">
          Import redirects
        </Typography>
        <Box paddingTop={2} paddingBottom={6}>
          <Typography textColor="neutral600">
            Bulk-create 301/302 redirects from a CSV file.
          </Typography>
        </Box>
        <RedirectImportForm />
      </Box>
    </Main>
  );
};

export { RedirectImportPage };
