import * as React from 'react';

import {
  Box,
  Button,
  Field,
  Flex,
  Table,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
  Typography,
} from '@strapi/design-system';
import { useFetchClient } from '@strapi/strapi/admin';

interface RowError {
  row: number;
  from: string;
  message: string;
}

interface ImportReport {
  successCount: number;
  errors: RowError[];
}

const RedirectImportForm = () => {
  const { post } = useFetchClient();
  const [file, setFile] = React.useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [report, setReport] = React.useState<ImportReport | null>(null);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setSubmitError(null);
    setReport(null);

    try {
      const formData = new FormData();
      formData.append('files', file);

      const { data } = await post<{ data: ImportReport }>('/sitetune/redirects/import', formData);

      setReport(data.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Flex direction="column" alignItems="stretch" gap={6}>
      <Box tag="form" onSubmit={handleSubmit}>
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Field.Root
            name="redirects-csv"
            hint="Columns: from, to, statusCode (301 or 302, defaults to 301), enabled (defaults to true)."
          >
            <Field.Label>CSV file</Field.Label>
            <Field.Input
              type="file"
              accept=".csv"
              onChange={(event: React.ChangeEvent<HTMLInputElement>) =>
                setFile(event.target.files?.[0] ?? null)
              }
            />
            <Field.Hint />
          </Field.Root>
          <Box>
            <Button type="submit" disabled={!file || isSubmitting} loading={isSubmitting}>
              Import
            </Button>
          </Box>
        </Flex>
      </Box>

      {submitError && <Typography textColor="danger600">{submitError}</Typography>}

      {report && (
        <Flex direction="column" alignItems="stretch" gap={4}>
          <Typography>
            {report.successCount} redirect{report.successCount === 1 ? '' : 's'} imported
            successfully.
            {report.errors.length > 0 &&
              ` ${report.errors.length} row${report.errors.length === 1 ? '' : 's'} failed.`}
          </Typography>

          {report.errors.length > 0 && (
            <Table colCount={3} rowCount={report.errors.length}>
              <Thead>
                <Tr>
                  <Th>
                    <Typography variant="sigma">Row</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">From</Typography>
                  </Th>
                  <Th>
                    <Typography variant="sigma">Error</Typography>
                  </Th>
                </Tr>
              </Thead>
              <Tbody>
                {report.errors.map((rowError) => (
                  <Tr key={rowError.row}>
                    <Td>
                      <Typography>{rowError.row}</Typography>
                    </Td>
                    <Td>
                      <Typography>{rowError.from || '—'}</Typography>
                    </Td>
                    <Td>
                      <Typography>{rowError.message}</Typography>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          )}
        </Flex>
      )}
    </Flex>
  );
};

export { RedirectImportForm };
