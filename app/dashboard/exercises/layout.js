import LibraryTabs from '@/components/LibraryTabs';

export default function Layout({ children }) {
  return (
    <>
      <LibraryTabs />
      {children}
    </>
  );
}
