import { Box, LinkButton, Main } from '@strapi/design-system';
import { useIntl } from 'react-intl';
import { Link } from 'react-router-dom';

import { getTranslation } from '../utils/getTranslation';

const HomePage = () => {
  const { formatMessage } = useIntl();

  return (
    <Main>
      <h1>Welcome to {formatMessage({ id: getTranslation('plugin.name') })}</h1>
      <Box paddingTop={4}>
        <LinkButton tag={Link} to="redirects/import">
          Import redirects (CSV)
        </LinkButton>
      </Box>
    </Main>
  );
};

export { HomePage };
