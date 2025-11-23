import { useState, lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletKitProvider } from '@mysten/wallet-kit';
import { Toaster } from 'react-hot-toast';
import { ErrorBoundary } from './components/ErrorBoundary';
import { WalletButton } from './components/WalletButton';
import { LandingPage } from './components/LandingPage';
import { Onboarding } from './components/Onboarding';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './components/ui/tabs';
import { useLumina } from './hooks/useLumina';
import { spacing } from './styles/theme';
import { WalletAuthProvider } from './contexts/WalletAuthContext';

// Lazy load heavy components
const CapsuleCreator = lazy(() => import('./components/CapsuleCreator').then(m => ({ default: m.CapsuleCreator })));
const PublicUnlock = lazy(() => import('./components/PublicUnlock').then(m => ({ default: m.PublicUnlock })));
const MemoryViewer = lazy(() => import('./components/MemoryViewer').then(m => ({ default: m.MemoryViewer })));
const SimpleNFTGallery = lazy(() => import('./components/SimpleNFTGallery').then(m => ({ default: m.SimpleNFTGallery })));

function AppContent() {
  const { isConnected, address, uploadCapsule, loading } = useLumina();
  const [activeTab, setActiveTab] = useState('nfts');
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Check if user has completed onboarding
  useEffect(() => {
    if (isConnected && !localStorage.getItem('lumina_onboarding_completed')) {
      setShowOnboarding(true);
    }
  }, [isConnected]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('lumina_onboarding_completed', 'true');
    setShowOnboarding(false);
  };

  const handleOnboardingSkip = () => {
    localStorage.setItem('lumina_onboarding_completed', 'true');
    setShowOnboarding(false);
  };

  // Show landing page if not connected
  if (!isConnected) {
    return (
      <>
        <Toaster 
          position="top-right"
          toastOptions={{
            duration: 3000,
            style: {
              background: '#0a0a0a',
              color: '#fff',
              border: '1px solid #1a1a1a',
              borderRadius: '4px',
              fontSize: '10px',
              padding: '5px 8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
            },
          }}
        />
        <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
          {/* Connect button at top right */}
          <div style={{
            position: 'fixed',
            top: spacing.lg,
            right: spacing.lg,
            zIndex: 1000,
          }}>
            <WalletButton />
          </div>

          <LandingPage />
        </div>
      </>
    );
  }

  return (
    <>
      <Toaster 
        position="top-right"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#0a0a0a',
            color: '#fff',
            border: '1px solid #1a1a1a',
            borderRadius: '4px',
            fontSize: '10px',
            padding: '5px 8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.5)',
          },
        }}
      />
      {showOnboarding && (
        <Onboarding
          onComplete={handleOnboardingComplete}
          onSkip={handleOnboardingSkip}
        />
      )}
      <div style={{ minHeight: '100vh', background: '#000', position: 'relative' }}>
        {/* Subtle gradient overlay */}
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: `
            radial-gradient(circle at 20% 30%, rgba(255, 255, 255, 0.03) 0%, transparent 50%),
            radial-gradient(circle at 80% 70%, rgba(255, 255, 255, 0.02) 0%, transparent 50%)
          `,
          pointerEvents: 'none',
          zIndex: 0,
        }} />

        <div style={{ 
          background: '#0a0a0a', 
          color: '#666', 
          padding: '3px 16px', 
          textAlign: 'center', 
          fontSize: '9px', 
          borderBottom: '1px solid #1a1a1a',
          position: 'relative',
          zIndex: 50,
        }}>
          TESTNET — Decentralized Whistleblower Platform
        </div>

        <header style={{ 
          borderBottom: '1px solid #1a1a1a', 
          position: 'relative',
          zIndex: 100, // Increased to ensure header is above content
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ 
            maxWidth: '1200px', 
            margin: '0 auto', 
            padding: '0 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '48px'
          }}>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: 300, 
              color: '#fff',
              letterSpacing: '0.15em',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
            }}>
              LUMINA
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: spacing.sm }}>
              <WalletButton />
            </div>
          </div>
        </header>

        <main style={{ 
          maxWidth: '1200px', 
          margin: '0 auto', 
          padding: '20px',
          position: 'relative',
          zIndex: 1,
        }}
        className="transition-smooth"
        >
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <div style={{ 
              marginBottom: '20px', 
              borderBottom: '1px solid #1a1a1a',
              position: 'relative',
            }}>
              <TabsList>
                <TabsTrigger value="create" style={{ fontSize: '13px', padding: '8px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif', fontWeight: 500 }}>Add Memory</TabsTrigger>
                <TabsTrigger value="nfts" style={{ fontSize: '13px', padding: '8px 16px', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif', fontWeight: 500 }}>My Vault</TabsTrigger>
              </TabsList>
              <div
                style={{
                  marginTop: '12px',
                  padding: '12px 16px',
                  border: '1px dashed rgba(0,212,255,0.25)',
                  borderRadius: '8px',
                  background: 'rgba(0,212,255,0.06)',
                  color: '#aaa',
                  fontSize: '12px',
                  lineHeight: 1.6,
                  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", sans-serif',
                  fontWeight: 400,
                }}
              >
                <strong style={{ color: '#00d4ff' }}>Flow:</strong> Create capsule → Set unlock conditions → Seal in light → Unlock when conditions met.
                Your memories encrypted forever, unlocked only by time, love, or proof you're still here.
              </div>
            </div>

            <TabsContent value="create" style={{ marginTop: 0 }}>
              <Suspense fallback={<div style={{ padding: spacing.lg, textAlign: 'center', color: '#fff' }}>Loading...</div>}>
                <CapsuleCreator 
                  address={address || ''}
                  isConnected={isConnected}
                  uploadCapsule={uploadCapsule}
                  loading={loading}
                />
              </Suspense>
            </TabsContent>
            <TabsContent value="nfts" style={{ marginTop: 0 }}>
              <Suspense fallback={<div style={{ padding: spacing.lg, textAlign: 'center', color: '#fff' }}>Loading...</div>}>
                <SimpleNFTGallery />
              </Suspense>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/memory/:memoryId" element={
            <WalletKitProvider>
              <WalletAuthProvider>
                <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>}>
                  <MemoryViewer />
                </Suspense>
              </WalletAuthProvider>
            </WalletKitProvider>
          } />
          <Route path="/unlock/:capsuleId" element={
            <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>}>
              <PublicUnlock />
            </Suspense>
          } />
          <Route path="/unlock" element={
            <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>}>
              <PublicUnlock />
            </Suspense>
          } />
          <Route path="*" element={
            <WalletKitProvider>
              <WalletAuthProvider>
                <Suspense fallback={<div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>Loading...</div>}>
                  <AppContent />
                </Suspense>
              </WalletAuthProvider>
            </WalletKitProvider>
          } />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  );
}

export default App;
