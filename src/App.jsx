import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithCustomToken, signInAnonymously, signOut, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, collection, query, onSnapshot, orderBy, serverTimestamp, addDoc, getDocs } from 'firebase/firestore';

// --- CONFIGURATION ---
const THEME = {
  primary: '#0a2342', // Deep Navy Blue
  secondary: '#f2c80f', // Gold/Amber
};

// --- NEW VERCEL/VITE CONFIGURATION ---
// Firebase Config object - Vercel will inject these values during build
const VITE_FIREBASE_CONFIG = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Use the environment variables:
const appId = import.meta.env.VITE_APP_ID || 'default-app-id'; 
const firebaseConfig = VITE_FIREBASE_CONFIG;
const initialAuthToken = null; // The custom Canvas auth token is not used here.

// Helper to construct Firestore paths
const getPrivateCollectionPath = (userId, collectionName) => 
  `artifacts/${appId}/users/${userId}/${collectionName}`;

// --- MOCK ADMIN DATA (CENTRALIZED FOR STAFF VIEW) ---

const MOCK_STAFF_DATA = [
    { id: 'jared', name: 'Jared Escobar', role: 'Power User', email: 'admin@esco.cpa', status: 'Active' },
    { id: 'cynthia', name: 'Cynthia Lozano', role: 'Staff (Tax)', email: 'cynthia@esco.cpa', status: 'Active' },
    { id: 'guadalupe', name: 'Guadalupe Escobar', role: 'Staff (Accounting)', email: 'guadalupe@esco.cpa', status: 'Active' },
];

// Enhanced CRM Data
let MOCK_CLIENTS_DATA = [ // Changed to let for mock updates
    { 
        id: 'client-1', 
        contactPerson: 'Alice Smith',
        companyName: 'Acme Solutions Inc.', 
        status: 'Active', 
        email: 'alice@acmesolutions.com', 
        phone: '(915) 555-0123',
        personalAddress: '4529 Coolidge Dr, El Paso, TX 79924',
        companyAddress: '1200 Airway Blvd, Suite 10, El Paso, TX 79925',
        assignedTo: 'jared' 
    },
    { 
        id: 'client-2', 
        contactPerson: 'Jane Doe',
        companyName: 'N/A (Individual)', 
        status: 'Active', 
        email: 'jane.doe@email.com', 
        phone: '(915) 555-0199',
        personalAddress: '8821 Gazelle Dr, El Paso, TX 79925',
        companyAddress: 'N/A',
        assignedTo: 'cynthia' 
    },
    { 
        id: 'client-3', 
        contactPerson: 'Robert Martinez',
        companyName: 'QuickMart LLC', 
        status: 'Inactive', 
        email: 'robert@quickmart.com', 
        phone: '(915) 555-0888',
        personalAddress: '10101 Montwood Dr, El Paso, TX 79935',
        companyAddress: '3030 Zaragoza Rd, El Paso, TX 79938',
        assignedTo: 'guadalupe' 
    },
    { 
        id: 'client-4', 
        contactPerson: 'Sarah Lee',
        companyName: 'West Side Eatery', 
        status: 'Active', 
        email: 'sarah@westsideoats.com', 
        phone: '(915) 555-0777',
        personalAddress: '500 Mesa St, El Paso, TX 79901',
        companyAddress: '700 N Mesa St, El Paso, TX 79902',
        assignedTo: 'cynthia' 
    },
];

const MOCK_INVOICES_DATA = [
    { id: 'inv-001', client: 'Acme Solutions Inc.', date: '10/20/2024', amount: 750.00, status: 'Outstanding' },
    { id: 'inv-002', client: 'Jane Doe', date: '11/05/2024', amount: 350.00, status: 'Paid' },
    { id: 'inv-003', client: 'QuickMart LLC', date: '09/15/2024', amount: 1200.00, status: 'Outstanding' },
    { id: 'inv-004', client: 'Acme Solutions Inc.', date: '08/01/2024', amount: 600.00, status: 'Paid' },
];

// Linked Todos to Client IDs for CRM functionality
const MOCK_TODOS_DATA = [
    { id: 1, clientId: 'client-1', task: 'Review Q3 financials for Acme Solutions', priority: 'High', color: 'red-500', done: false, assignedTo: null },
    { id: 2, clientId: 'client-2', task: 'Confirm W-2 receipt from Jane Doe', priority: 'Medium', color: 'yellow-500', done: false, assignedTo: 'cynthia' },
    { id: 3, clientId: 'client-3', task: 'Send late payment notice to QuickMart LLC', priority: 'High', color: 'red-500', done: false, assignedTo: null },
    { id: 4, clientId: null, task: 'Schedule internal training on new tax codes', priority: 'Low', color: 'blue-500', done: true, assignedTo: 'jared' },
];

// Mock Appointment Data
const MOCK_APPOINTMENTS_DATA = [
    { id: 1, dateTime: '2025-01-15T10:00:00', clientText: 'Alice Smith (Acme Solutions)', assignedTo: 'jared', status: 'Scheduled' },
    { id: 2, dateTime: '2025-01-16T14:30:00', clientText: 'Robert Martinez (QuickMart LLC)', assignedTo: 'cynthia', status: 'Confirmed' },
    { id: 3, dateTime: '2025-02-01T09:00:00', clientText: 'Jane Doe (Individual)', assignedTo: 'guadalupe', status: 'Scheduled' },
];

// Mock Financial Data from QuickBooks
const MOCK_FINANCIAL_DATA = {
    pnl: [
        { category: 'Revenue', items: [{ name: 'Sales', value: 125000 }, { name: 'Services', value: 45000 }], total: 170000 },
        { category: 'Cost of Goods Sold', items: [{ name: 'Materials', value: 40000 }, { name: 'Labor', value: 30000 }], total: 70000 },
        { category: 'Expenses', items: [{ name: 'Rent', value: 12000 }, { name: 'Utilities', value: 3500 }, { name: 'Marketing', value: 5000 }, { name: 'Software', value: 1200 }], total: 21700 },
    ],
    netIncome: 78300,
    lastUpdated: '11/26/2024 09:00 AM'
};

// Mock Admin Notes for the Client Financials
const MOCK_ADMIN_NOTES = [
    { id: 1, date: '11/25/2024', author: 'Jared Escobar', text: 'Please review the "Marketing" expense category. There are two large transactions from "BestBuy" that might need to be capitalized as equipment.' },
    { id: 2, date: '11/20/2024', author: 'Guadalupe Escobar', text: 'Reconciled bank statements for October. Everything looks good, but please attach the receipt for the $500 dinner on 10/15.' },
];

const MOCK_CLIENT_FILES = {
    'client-1': {
        // Shared by CPA (CPA -> Client)
        documents_shared: [ 
            { name: '2023 Tax Return (Draft).pdf', date: '04/15/2024', size: '1.2MB', content: 'Mock Content: 2023 Tax Return data summary and forms (W-2s, 1099s). This is sensitive tax data.', requiresSignature: false },
            { name: 'Engagement Letter 2025.pdf', date: '11/26/2024', size: '50KB', content: 'Mock Content: Terms of Service and Fee Agreement for 2025 engagement.', requiresSignature: true },
            { name: 'Client W-9.pdf', date: '01/05/2024', size: '300KB', content: 'Mock Content: W-9 form for vendor setup.', requiresSignature: false },
            { name: 'Q4 2024 P&L.xlsx', date: '11/15/2024', size: '550KB', content: 'Mock Content: Profit and Loss Statement for Q4 2024. Includes revenue and expense breakdowns.', requiresSignature: false },
        ],
        // Received from Client (Client -> CPA)
        documents_received: [ 
            { name: 'Jan-Oct Bank Statements.pdf', date: '11/01/2024', size: '3.5MB' },
            { name: 'CEO Compensation Details.docx', date: '01/02/2024', size: '150KB' },
        ],
        invoices: [
            { id: 'inv-001', date: '10/20/2024', amount: 750.00, status: 'Outstanding', content: 'Mock Invoice Content: Monthly Accounting Fee - October 2024.' },
            { id: 'inv-004', date: '08/01/2024', amount: 600.00, status: 'Paid', content: 'Mock Invoice Content: Payroll Processing Fee - August 2024.' },
        ],
        tickets: [
            { id: 'tkt-45', subject: 'Question on estimated payments', status: 'Closed', lastUpdate: '10/25/2024' },
            { id: 'tkt-46', subject: 'Tax document upload issue', status: 'New', lastUpdate: '11/20/2024' },
        ],
        payments: [
            { id: 'pay-004', date: '08/05/2024', amount: 600.00, method: 'ACH' },
        ],
    },
    // ... other client data
    'client-2': {
         documents_shared: [],
         documents_received: [],
         invoices: [
            { id: 'inv-002', date: '11/05/2024', amount: 350.00, status: 'Paid', content: 'Mock Invoice Content: Individual Tax Prep - 2023 return.' },
         ],
         tickets: [], payments: [] 
    }
};

const MOCK_CLIENT_MESSAGES = [
    { id: 1, text: "Your Q3 P&L statement is now available in the Financials tab.", date: "11/25/2024", type: 'Alert' },
    { id: 2, text: "Please review and approve the new engagement letter.", date: "11/20/2024", type: 'Action' },
];


// --- MAIN APP COMPONENT ---

const App = () => {
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState('home'); // 'home', 'portal', 'login', 'admin'
  const [clientView, setClientView] = useState('home'); // Client: 'home', 'messages', 'invoices', 'documents', 'settings', 'financials'
  const [tickets, setTickets] = useState([]);
  const [userRole, setUserRole] = useState('anonymous'); // 'anonymous', 'client', 'admin'
  const [todos, setTodos] = useState(MOCK_TODOS_DATA); // State for Admin To-Dos
  const [clients, setClients] = useState(MOCK_CLIENTS_DATA); // State for Admin Clients
  const [staff, setStaff] = useState(MOCK_STAFF_DATA); // State for Admin Staff
  const [appointments, setAppointments] = useState(MOCK_APPOINTMENTS_DATA); // State for Admin Appointments
  const [sendModal, setSendModal] = useState({ isOpen: false, type: null, items: [] }); // { isOpen: bool, type: 'document'|'invoice', items: [{name, id}] }
  const [documentModal, setDocumentModal] = useState({ isOpen: false, title: '', content: '', requiresSignature: false, isSigned: false });
  const [createClientModalOpen, setCreateClientModalOpen] = useState(false); // State for new client modal

  // 1. Firebase Initialization and Authentication
  useEffect(() => {
    let unsubscribe = () => {};
    let isMounted = true;

    try {
        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const firebaseAuth = getAuth(app);
        setDb(firestore);
        setAuth(firebaseAuth);

        const handleAuth = async () => {
            if (initialAuthToken) {
                await signInWithCustomToken(firebaseAuth, initialAuthToken).catch(err => {
                    console.error("Custom token sign-in failed, falling back to anonymous:", err);
                    signInAnonymously(firebaseAuth);
                });
            } else {
                await signInAnonymously(firebaseAuth);
            }
        };

        handleAuth();

        unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
            if (isMounted) {
                setUser(currentUser);
                setIsAuthReady(true);
                // Assign a default role based on whether the user is logged in
                if (currentUser) {
                    // For the purpose of this demo, we assume initial auth is for client (or is anonymous)
                    setUserRole(currentUser.isAnonymous ? 'anonymous' : 'client'); 
                } else {
                    setUserRole('anonymous');
                }
            }
        });

    } catch (e) {
        console.error("Firebase initialization failed:", e);
        setIsAuthReady(true); // Still mark ready even on failure to render UI
    }

    return () => {
        isMounted = false;
        unsubscribe();
    };
  }, []);

  // 2. Data Listener (Tickets - Client Only)
  useEffect(() => {
    let unsubscribe = () => {};
    
    if (isAuthReady && db && user && userRole === 'client') {
      // Guard against running before authentication is complete
      const ticketsPath = getPrivateCollectionPath(user.uid, 'tickets');
      const q = collection(db, ticketsPath);

      try {
        unsubscribe = onSnapshot(q, (snapshot) => {
          const fetchedTickets = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          })).sort((a, b) => (b.createdAt?.toMillis() || 0) - (a.createdAt?.toMillis() || 0)); // Sort by creation time DESC
          setTickets(fetchedTickets);
        }, (error) => {
          console.error("Error listening to tickets:", error);
        });
      } catch (error) {
        console.error("Failed to set up onSnapshot for tickets:", error);
      }
    }
    
    return () => unsubscribe();
  }, [isAuthReady, db, user, userRole]);


  // --- HANDLERS ---
  const handleSignOut = useCallback(async () => {
    if (auth) {
      try {
        await signOut(auth);
        setUser(null);
        setUserRole('anonymous');
        setView('home');
      } catch (error) {
        console.error("Logout failed:", error);
      }
    }
  }, [auth]);

  const handleCreateTicket = async (subject, description) => {
    if (!db || !user) return { success: false, message: "Authentication required." };
    
    if (user.isAnonymous) {
        return { success: false, message: "Please register or log in to submit a ticket." };
    }

    const ticketsPath = getPrivateCollectionPath(user.uid, 'tickets');
    
    try {
      await addDoc(collection(db, ticketsPath), {
        subject,
        description,
        status: 'New',
        createdAt: serverTimestamp(),
        // For Admin visibility, you might also add: clientId: user.uid, clientEmail: user.email
      });
      return { success: true, message: "Ticket submitted successfully!" };
    } catch (error) {
      console.error("Error submitting ticket:", error);
      return { success: false, message: "Failed to submit ticket. Check console for details." };
    }
  };
  
  // Admin only handler
  const handleAssignTask = (taskId, staffId) => {
      setTodos(prevTodos => 
          prevTodos.map(todo => 
              todo.id === taskId ? { ...todo, assignedTo: staffId } : todo
          )
      );
  };
  
  // Admin: Create new task for a client
  const handleCreateClientTask = (clientId, taskText, priority, assignedTo) => {
      const newId = Math.max(...todos.map(t => t.id), 0) + 1;
      const newTask = {
          id: newId,
          clientId: clientId,
          task: taskText,
          priority: priority,
          color: priority === 'High' ? 'red-500' : priority === 'Medium' ? 'yellow-500' : 'blue-500',
          done: false,
          assignedTo: assignedTo || null
      };
      setTodos(prev => [newTask, ...prev]);
  };
  
  // Admin only handler
  const handleToggleStaffStatus = (staffId) => {
      setStaff(prevStaff =>
          prevStaff.map(member =>
              member.id === staffId ? { ...member, status: member.status === 'Active' ? 'Inactive' : 'Active' } : member
          )
      );
  };

  // Admin: Create new appointment (Mock data handled)
  const handleCreateAppointment = (newApptData) => {
      setAppointments(prev => {
          const newId = Math.max(...prev.map(a => a.id), 0) + 1;
          const newAppt = {
              id: newId,
              ...newApptData,
              status: 'Scheduled', // Default status
          };
          // Add new appointment and sort by date time
          return [newAppt, ...prev].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime));
      });
  };
  
  // Admin: Create new client (Mock data handled)
  const handleCreateClient = (newClientData) => {
      setClients(prev => {
          const newIdNum = prev.length > 0 ? Math.max(...prev.map(c => parseInt(c.id.split('-')[1])), 0) + 1 : 1;
          const newClientId = `client-${newIdNum}`;
          const newClient = {
              id: newClientId,
              status: 'Active',
              ...newClientData,
          };
          // IMPORTANT: Update both the clients state and the global mock client data array
          MOCK_CLIENTS_DATA.push(newClient);
          return [newClient, ...prev]; // Add to the top of the list
      });
      // Optionally create a mock file entry for the new client
      MOCK_CLIENT_FILES[newClient.id] = { 
          documents_shared: [], 
          documents_received: [], 
          invoices: [], 
          tickets: [], 
          payments: [] 
      };
      console.log(`Mock: New client created with ID: ${newClientId}`);
  };


  const handleOpenDocument = (title, content, requiresSignature = false) => {
    // Determine mock signature status based on document name (e.g., if it was already signed)
    const isSigned = title.includes("Engagement Letter") ? false : false; 
    setDocumentModal({ isOpen: true, title, content, requiresSignature, isSigned });
  };
  
  const handleOpenSendModal = (type, items) => {
    setSendModal({ isOpen: true, type, items });
  };
  
  const handlePrint = (title) => {
      console.log(`Mock: Initiating print sequence for: ${title}`);
      // In a real app, you would open a new window or trigger a browser print action here.
  };

  const handleDocumentSign = (signatureData) => {
      console.log(`Document Signed: ${documentModal.title}`);
      // In a real app: Send signatureData (base64 PNG) to Firebase storage or document metadata.
      // For mock: just update the state to reflect the signed status.
      setDocumentModal(prev => ({ ...prev, isSigned: true }));
      console.log("Signature data (base64):", signatureData.substring(0, 50) + "...");
  };


  // --- UI COMPONENTS (MODALS & UTILITIES) ---
  
  const SignaturePad = ({ onSign, onClear, isSigned, signerName }) => {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Initial setup
    useEffect(() => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            // Make canvas high-resolution for better signature quality
            const rect = canvas.getBoundingClientRect();
            canvas.width = rect.width * window.devicePixelRatio;
            canvas.height = rect.height * window.devicePixelRatio;
            ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.strokeStyle = THEME.primary;
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
        }
    }, []);

    const getCanvasPoint = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        
        let clientX, clientY;
        if (e.touches && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        if (isSigned) return;
        const ctx = canvasRef.current.getContext('2d');
        ctx.beginPath();
        const point = getCanvasPoint(e);
        ctx.moveTo(point.x, point.y);
        setIsDrawing(true);
        e.preventDefault();
    };

    const draw = (e) => {
        if (!isDrawing || isSigned) return;
        const ctx = canvasRef.current.getContext('2d');
        const point = getCanvasPoint(e);
        ctx.lineTo(point.x, point.y);
        ctx.stroke();
        e.preventDefault();
    };

    const stopDrawing = () => {
        if (isSigned) return;
        setIsDrawing(false);
        // Save the signature data when drawing stops
        const canvas = canvasRef.current;
        if (canvas) {
            const signatureData = canvas.toDataURL('image/png');
            // This is where you would typically validate if the user actually drew something
            // For mock purposes, we just log it and offer to complete the signature
            // console.log("Signature captured but not yet applied:", signatureData.substring(0, 50));
        }
    };
    
    const handleClear = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
            ctx.fillStyle = 'white';
            ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
        }
        onClear();
    };
    
    const handleSignClick = () => {
        const canvas = canvasRef.current;
        if (canvas) {
            const signatureData = canvas.toDataURL('image/png');
            onSign(signatureData);
        }
    };

    // Apply mock signature if already signed (for visual mock only)
    useEffect(() => {
        if (isSigned) {
             const canvas = canvasRef.current;
             if (canvas) {
                 const ctx = canvas.getContext('2d');
                 ctx.clearRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
                 ctx.fillStyle = '#f0f0f0'; // Signed background color
                 ctx.fillRect(0, 0, canvas.width / window.devicePixelRatio, canvas.height / window.devicePixelRatio);
                 
                 ctx.fillStyle = THEME.primary;
                 ctx.font = '24px "Inter", cursive'; 
                 ctx.fillText(`Signed by: ${signerName}`, 10, 30);
                 ctx.font = '14px "Inter"'; 
                 ctx.fillStyle = '#6b7280';
                 ctx.fillText(`on ${new Date().toLocaleString()}`, 10, 55);
             }
        }
    }, [isSigned, signerName]);


    return (
        <div className="border border-gray-300 rounded-lg p-4 space-y-3 bg-white shadow-md">
            <h5 className="text-lg font-semibold text-primary">Signature Area (Signer: {signerName})</h5>
            
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseUp={stopDrawing}
                onMouseMove={draw}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchEnd={stopDrawing}
                onTouchMove={draw}
                onTouchCancel={stopDrawing}
                className={`w-full h-32 border-2 rounded-lg ${isSigned ? 'border-green-400 cursor-default' : 'border-dashed border-red-300 cursor-crosshair'}`}
                style={{touchAction: 'none'}}
            />

            {!isSigned ? (
                <div className="flex space-x-3">
                    <button 
                        type="button" 
                        onClick={handleSignClick} 
                        className="flex-1 bg-green-500 text-white py-2 rounded-lg font-semibold hover:bg-green-600 transition"
                    >
                        Apply Signature (Mock)
                    </button>
                    <button 
                        type="button" 
                        onClick={handleClear} 
                        className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition"
                    >
                        Clear
                    </button>
                </div>
            ) : (
                <div className="p-2 bg-green-50 text-green-700 rounded-lg text-center font-medium">
                    Document marked as SIGNED in portal.
                </div>
            )}
        </div>
    );
  };
  
  const SendDocumentModal = ({ isOpen, type, items, onClose }) => {
    const [recipient, setRecipient] = useState('');
    const [method, setMethod] = useState('email'); // 'email' or 'sms'
    const [message, setMessage] = useState(null);

    if (!isOpen) return null;

    const handleSubmit = (e) => {
        e.preventDefault();
        setMessage(null);
        
        const itemNames = items.map(item => item.name || item.id).join(', ');
        
        if (!recipient) {
            setMessage({ type: 'error', text: 'Please enter a recipient address.' });
            return;
        }

        const action = method === 'email' ? 'Email' : 'SMS';
        const target = method === 'email' ? `to ${recipient}` : `to phone ${recipient}`;

        setMessage({ 
            type: 'success', 
            text: `Mock: Successfully sent ${type}(s) [${itemNames}] via ${action} ${target}.` 
        });
        
        setTimeout(() => {
            onClose();
            setMessage(null);
            setRecipient('');
            setMethod('email');
        }, 3000);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
                <h3 className="text-2xl font-bold text-primary border-b pb-2 mb-4">Send {type === 'document' ? 'Document(s)' : 'Invoice(s)'}</h3>
                
                <p className="text-sm text-gray-600 mb-4">
                    Items selected: <strong>{items.map(item => item.name || item.id).join(', ')}</strong>
                </p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Send Method Toggle */}
                    <div className="flex space-x-4 mb-4">
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="sendMethod" 
                                value="email" 
                                checked={method === 'email'}
                                onChange={() => setMethod('email')}
                                className="text-primary focus:ring-primary"
                            />
                            <span className="text-gray-700 font-medium">Email</span>
                        </label>
                        <label className="flex items-center space-x-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="sendMethod" 
                                value="sms" 
                                checked={method === 'sms'}
                                onChange={() => setMethod('sms')}
                                className="text-primary focus:ring-primary"
                            />
                            <span className="text-gray-700 font-medium">SMS (Text)</span>
                        </label>
                    </div>

                    {/* Recipient Input */}
                    <div>
                        <label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-1">
                            Recipient {method === 'email' ? 'Email Address' : 'Phone Number'}
                        </label>
                        <input
                            type={method === 'email' ? 'email' : 'tel'}
                            id="recipient"
                            value={recipient}
                            onChange={(e) => setRecipient(e.target.value)}
                            placeholder={method === 'email' ? 'client@example.com' : '(915) 555-1234'}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"
                        />
                    </div>
                    
                    {message && (
                        <div className={`p-3 rounded-lg text-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}

                    <div className="flex justify-end space-x-3 pt-4">
                        <button type="button" onClick={onClose} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition">
                            Cancel
                        </button>
                        <button type="submit" className="px-4 py-2 text-white bg-primary rounded-lg font-semibold hover:bg-primary/90 transition">
                            Confirm Send
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
  };
  
  const DocumentViewModal = ({ isOpen, title, content, onClose, onSend, onPrint, requiresSignature, isSigned, onSignDocument }) => {
      if (!isOpen) return null;

      // Mock signer name (could be fetched from client data)
      const mockSignerName = "Alice Smith (Acme Solutions Inc.)";
      // This is an admin view, so the 'Sign Document' button is for testing/demonstration only.
      // In a client portal, this would be the main action button for required documents.

      return (
          <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-[100] flex items-center justify-center p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl h-[80vh] flex flex-col">
                  <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                      <h3 className="text-xl font-bold text-primary truncate mr-4">{title}</h3>
                      <div className="flex space-x-3">
                           {requiresSignature && (
                                <span className={`px-3 py-1.5 text-sm font-semibold rounded-lg ${isSigned ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                                    {isSigned ? 'SIGNED' : 'SIGNATURE REQUIRED'}
                                </span>
                           )}
                          <button 
                              onClick={() => onPrint(title)} 
                              className="px-3 py-1.5 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition flex items-center"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                              Print (Mock)
                          </button>
                          <button 
                              onClick={() => onSend('document', [{ name: title }])} 
                              className="px-3 py-1.5 text-sm bg-secondary text-primary rounded-lg font-semibold hover:bg-amber-400 transition flex items-center"
                          >
                              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4 20-7z"/></svg>
                              Send (Mock)
                          </button>
                          <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                      </div>
                  </header>
                  <div className="p-6 overflow-y-auto flex-1 bg-gray-50">
                      <div className="bg-white p-8 border border-gray-300 rounded-lg shadow-inner min-h-full">
                          <h4 className="text-xl font-bold mb-4">{title} Content Preview</h4>
                          <pre className="whitespace-pre-wrap font-mono text-sm text-gray-700 bg-gray-50 p-3 rounded-lg border">
                              {content}
                          </pre>

                          {/* Signature Component Integration */}
                          {requiresSignature && (
                            <div className="mt-8 border-t pt-6">
                                <SignaturePad 
                                    onSign={onSignDocument} 
                                    onClear={() => setDocumentModal(prev => ({ ...prev, isSigned: false }))} 
                                    isSigned={isSigned} 
                                    signerName={mockSignerName}
                                />
                            </div>
                          )}

                          <p className="mt-6 text-sm text-red-500">
                              *This is a mock content preview. Real documents (PDF, Excel) would require a viewer or download link.
                          </p>
                      </div>
                  </div>
              </div>
          </div>
      );
  };

  const CreateClientModal = ({ isOpen, onClose, onCreateClient, staff }) => {
    const [formData, setFormData] = useState({
        contactPerson: '',
        companyName: '',
        email: '',
        phone: '',
        personalAddress: '',
        companyAddress: '',
        assignedTo: '',
    });
    const [message, setMessage] = useState(null);

    if (!isOpen) return null;

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setMessage(null);

        // Simple validation
        if (!formData.contactPerson || !formData.email || !formData.formData) {
            setMessage({ type: 'error', text: 'Please fill out required fields (Contact, Email, Company Name).' });
            return;
        }

        // Create new client object
        onCreateClient(formData);

        setMessage({ type: 'success', text: `Client ${formData.companyName || formData.contactPerson} created!` });
        
        // Reset and close after a delay
        setTimeout(() => {
            onClose();
            setFormData({
                contactPerson: '',
                companyName: '',
                email: '',
                phone: '',
                personalAddress: '',
                companyAddress: '',
                assignedTo: '',
            });
            setMessage(null);
        }, 1500);
    };

    return (
        <div className="fixed inset-0 bg-gray-900 bg-opacity-75 z-[100] flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h3 className="text-2xl font-bold text-primary">New Client Onboarding</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-900">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                </header>
                
                <form onSubmit={handleSubmit} className="flex-1 p-6 overflow-y-auto space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-4 bg-gray-50 rounded-lg border">
                        {/* Core Client Info */}
                        <div className="md:col-span-2">
                             <h4 className="text-lg font-semibold text-primary mb-3">Core Information</h4>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person <span className="text-red-500">*</span></label>
                            <input type="text" name="contactPerson" value={formData.contactPerson} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input type="text" name="companyName" value={formData.companyName} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Email <span className="text-red-500">*</span></label>
                            <input type="email" name="email" value={formData.email} onChange={handleChange} required className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        
                        {/* Assignment */}
                         <div className="md:col-span-2 pt-4 border-t border-gray-200">
                             <h4 className="text-lg font-semibold text-primary mb-3">Staff Assignment</h4>
                        </div>
                        <div className="md:col-span-2">
                             <label className="block text-sm font-medium text-gray-700 mb-1">Assigned CPA/Staff</label>
                            <select name="assignedTo" value={formData.assignedTo} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg bg-white">
                                <option value="">Select Staff</option>
                                {staff.filter(m => m.status === 'Active').map(member => (
                                    <option key={member.id} value={member.id}>{member.name} ({member.role.replace('Staff ', '')})</option>
                                ))}
                            </select>
                        </div>

                        {/* Address Info */}
                        <div className="md:col-span-2 pt-4 border-t border-gray-200">
                             <h4 className="text-lg font-semibold text-primary mb-3">Address Details</h4>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company/Business Address</label>
                            <input type="text" name="companyAddress" value={formData.companyAddress} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                        <div className="md:col-span-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Personal/Mailing Address</label>
                            <input type="text" name="personalAddress" value={formData.personalAddress} onChange={handleChange} className="w-full px-3 py-2 border rounded-lg"/>
                        </div>
                    </div>
                    
                    {message && (
                        <div className={`p-3 rounded-lg text-center ${message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                            {message.text}
                        </div>
                    )}
                </form>

                <footer className="p-4 border-t flex justify-end">
                    <button 
                        type="submit" 
                        onClick={handleSubmit}
                        className="px-6 py-3 bg-green-600 text-white rounded-lg font-bold text-lg hover:bg-green-700 transition shadow-lg"
                    >
                        Create New Client
                    </button>
                </footer>
            </div>
        </div>
    );
  };


  // --- UI COMPONENTS (MARKETING) ---

  const Navbar = ({ onSignOut }) => {
    const navItemClass = "text-white hover:text-secondary transition duration-300 font-medium";
    
    const LoginButton = () => {
        if (userRole === 'admin') {
            return (
                 <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => setView('admin')}
                        className="px-4 py-2 text-primary bg-secondary rounded-lg font-semibold hover:bg-amber-400 transition duration-300 shadow-md"
                    >
                        Admin Portal
                    </button>
                    <button onClick={onSignOut} className="text-sm px-3 py-1 text-gray-300 hover:text-red-400">
                        Sign Out
                    </button>
                </div>
            );
        }
        if (userRole === 'client') {
             return (
                 <div className="flex items-center space-x-4">
                    <button 
                        onClick={() => setView('portal')}
                        className="px-4 py-2 text-primary bg-secondary rounded-lg font-semibold hover:bg-amber-400 transition duration-300 shadow-md"
                    >
                        Client Portal
                    </button>
                    <button onClick={onSignOut} className="text-sm px-3 py-1 text-gray-300 hover:text-red-400">
                        Sign Out
                    </button>
                </div>
            );
        }
        return (
             <button 
                onClick={() => setView('login')}
                className="px-4 py-2 text-primary bg-secondary rounded-lg font-semibold hover:bg-amber-400 transition duration-300 shadow-md"
            >
                Client Login
            </button>
        );
    }
    
    return (
        <header className="fixed top-0 left-0 right-0 bg-primary shadow-lg z-50">
            <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
                <a onClick={() => setView('home')} className="text-2xl font-bold cursor-pointer text-white flex items-center group">
                    <span className="text-secondary text-3xl mr-1">E</span><span className="tracking-wide">sco CPA</span>
                </a>
                <div className="hidden md:flex space-x-8 items-center">
                    <a onClick={() => setView('home')} className={navItemClass}>Home</a>
                    <a onClick={() => setView('home')} href="#about" className={navItemClass}>About Us</a>
                    <a onClick={() => setView('home')} href="#services" className={navItemClass}>Services</a>
                    
                    <LoginButton />
                </div>
                {/* Mobile Menu Button - simplified for brevity, assuming toggle logic is similar */}
                <button 
                    onClick={() => document.getElementById('mobile-menu').classList.toggle('hidden')}
                    className="md:hidden text-secondary focus:outline-none p-2 rounded-lg hover:bg-primary/90"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
                </button>
            </nav>
        </header>
    );
  };

  const MobileMenu = ({ onSignOut }) => (
    <div id="mobile-menu" className="hidden md:hidden bg-primary border-t border-gray-700 fixed top-[64px] left-0 right-0 z-40 shadow-xl">
        <a onClick={() => { setView('home'); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-white hover:bg-primary/80 border-b border-gray-700">Home</a>
        <a onClick={() => { setView('home'); document.getElementById('mobile-menu').classList.add('hidden'); }} href="#about" className="block py-3 px-4 text-white hover:bg-primary/80 border-b border-gray-700">About Us</a>
        <a onClick={() => { setView('home'); document.getElementById('mobile-menu').classList.add('hidden'); }} href="#services" className="block py-3 px-4 text-white hover:bg-primary/80 border-b border-gray-700">Services</a>
        
        {userRole === 'admin' ? (
            <>
                <a onClick={() => { setView('admin'); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-secondary hover:bg-primary/80 border-b border-gray-700 font-semibold">Admin Portal</a>
                <a onClick={() => { onSignOut(); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-red-300 hover:bg-primary/80">Sign Out</a>
            </>
        ) : userRole === 'client' ? (
            <>
                <a onClick={() => { setView('portal'); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-secondary hover:bg-primary/80 border-b border-gray-700 font-semibold">Client Portal</a>
                <a onClick={() => { onSignOut(); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-red-300 hover:bg-primary/80">Sign Out</a>
            </>
        ) : (
            <a onClick={() => { setView('login'); document.getElementById('mobile-menu').classList.add('hidden'); }} className="block py-3 px-4 text-secondary hover:bg-primary/80 font-semibold">Client Login</a>
        )}
    </div>
  );

  const Footer = () => (
    <footer className="bg-primary text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 border-b border-gray-700 pb-8 mb-8">
                <div>
                    <h5 className="text-xl font-bold text-secondary mb-4">Esco CPA</h5>
                    <p className="text-sm text-gray-400">Your partner for financial confidence and growth in El Paso.</p>
                </div>
                <div>
                    <h6 className="text-lg font-semibold mb-4">Quick Links</h6>
                    <ul className="space-y-2 text-sm">
                        <li><a onClick={() => setView('home')} className="hover:text-secondary transition duration-300 cursor-pointer">Home</a></li>
                        <li><a onClick={() => setView('home')} href="#about" className="hover:text-secondary transition duration-300">About Us</a></li>
                        <li><a onClick={() => setView('home')} href="#services" className="hover:text-secondary transition duration-300">Services</a></li>
                    </ul>
                </div>
                <div>
                    <h6 className="text-lg font-semibold mb-4">Office</h6>
                    <address className="not-italic text-sm text-gray-400 space-y-1">
                        <p>1533 Lee Trevino, Suite 202</p>
                        <p>El Paso, TX 79936</p>
                    </address>
                </div>
                <div>
                    <h6 className="text-lg font-semibold mb-4">Connect</h6>
                    <p className="text-sm text-gray-400">Email: contact@escocpa.com</p>
                    <p className="text-sm text-gray-400">Phone: (915) 555-ESCO</p>
                </div>
            </div>
            <div className="text-center text-sm text-gray-500">
                &copy; {new Date().getFullYear()} Esco CPA. All rights reserved.
            </div>
        </div>
    </footer>
  );

  const ContactForm = () => {
    const [formMessage, setFormMessage] = useState({ text: '', type: '' });

    const handleSubmit = (e) => {
        e.preventDefault();
        const name = e.target.name.value;
        const email = e.target.email.value;
        
        if (!name || !email) {
            setFormMessage({ text: 'Please fill out all required fields.', type: 'error' });
            return;
        }

        // --- Simulated Submission ---
        setFormMessage({ text: 'Thank you for your message! We will be in touch shortly.', type: 'success' });
        e.target.reset();

        setTimeout(() => setFormMessage({ text: '', type: '' }), 5000);
    };

    const messageClass = formMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

    return (
        <div className="lg:w-2/3">
            <form onSubmit={handleSubmit} className="space-y-6 p-6 md:p-8 bg-gray-50 rounded-xl border border-gray-200 shadow-md">
                <div>
                    <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                    <input type="text" id="name" name="name" required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"/>
                </div>
                <div>
                    <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input type="email" id="email" name="email" required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"/>
                </div>
                <div>
                    <label htmlFor="message" className="block text-sm font-medium text-gray-700 mb-1">How can we help?</label>
                    <textarea id="message" name="message" rows="5" required className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary transition duration-150"></textarea>
                </div>
                <button type="submit" className="w-full md:w-auto inline-flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-lg text-white bg-primary hover:bg-primary/90 transition duration-300 shadow-lg">
                    Send Message
                </button>
                {formMessage.text && (
                    <div className={`mt-4 p-3 rounded-lg text-center ${messageClass}`} role="alert">
                        {formMessage.text}
                    </div>
                )}
            </form>
        </div>
    );
  };

  const MarketingPage = () => (
    <main>
        {/* Hero Section */}
        <section id="home" className="pt-[80px] bg-[--primary-color] text-white py-24 sm:py-32" style={{ background: `linear-gradient(135deg, ${THEME.primary} 0%, #1a3d60 100%)` }}>
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div className="max-w-3xl mx-auto">
                    <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight mb-4 leading-tight">
                        <span className="text-secondary">Clarity</span> & Confidence in Your Finances
                    </h1>
                    <p className="text-xl text-gray-200 mb-8">
                        Esco CPA provides personalized Tax, Accounting, and Business Consulting services tailored for individuals and businesses in El Paso and beyond.
                    </p>
                    <a onClick={() => setView('home')} href="#contact" className="inline-flex items-center justify-center px-8 py-3 border border-transparent text-base font-medium rounded-lg text-primary bg-secondary hover:bg-amber-400 transition duration-300 shadow-xl transform hover:scale-[1.02]">
                        Schedule a Consultation
                    </a>
                </div>
            </div>
        </section>

        {/* About Us Section */}
        <section id="about" className="py-20 lg:py-28 section-padding bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-bold text-primary mb-3">About Esco CPA</h2>
                    <p className="text-xl text-accent max-w-2xl mx-auto text-slate-500">
                        A commitment to excellence, integrity, and client success.
                    </p>
                </div>
                {/* ... (Rest of About Content) ... */}
                <div className="mt-20">
                    <h3 className="text-3xl font-bold text-center text-primary mb-10 border-b border-secondary/50 pb-4">Meet the Team</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Jared Escobar */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-secondary text-center">
                            <img src="https://placehold.co/100x100/0a2342/ffffff?text=J.E." alt="Jared Escobar" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary/50"/>
                            <h4 className="text-xl font-semibold text-primary">Jared Escobar CPA</h4>
                            <p className="text-secondary font-medium mb-3">Certified Public Accountant</p>
                            <p className="text-sm text-gray-500">Focuses on business strategy, advanced tax planning, and compliance for corporations and high-net-worth individuals.</p>
                        </div>
                        {/* Cynthia Lozano */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-secondary text-center">
                            <img src="https://placehold.co/100x100/0a2342/ffffff?text=C.L." alt="Cynthia Lozano" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary/50"/>
                            <h4 className="text-xl font-semibold text-primary">Cynthia Lozano</h4>
                            <p className="text-secondary font-medium mb-3">Tax Specialist</p>
                            <p className="text-sm text-gray-500">Expert in individual and small business tax preparation, ensuring accuracy and leveraging every available deduction.</p>
                        </div>
                        {/* Guadalupe Escobar */}
                        <div className="bg-white p-6 rounded-xl shadow-lg border-t-4 border-secondary text-center">
                            <img src="https://placehold.co/100x100/0a2342/ffffff?text=G.E." alt="Guadalupe Escobar" className="w-24 h-24 rounded-full mx-auto mb-4 object-cover ring-4 ring-secondary/50"/>
                            <h4 className="text-xl font-semibold text-primary">Guadalupe Escobar</h4>
                            <p className="text-secondary font-medium mb-3">Accountant</p>
                            <p className="text-sm text-gray-500">Manages bookkeeping, payroll, and general ledger maintenance, providing a solid foundation for financial reporting.</p>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Services Section */}
        <section id="services" className="py-20 lg:py-28 section-padding bg-gray-100">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-bold text-primary mb-3">Our Specialized Services</h2>
                    <p className="text-xl text-accent max-w-2xl mx-auto text-slate-500">
                        Comprehensive solutions to meet your unique financial needs.
                    </p>
                </div>
                {/* ... (Services grid content) ... */}
            </div>
        </section>

        {/* Contact Us Section */}
        <section id="contact" className="py-20 lg:py-28 section-padding bg-white">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="text-center mb-16">
                    <h2 className="text-4xl font-bold text-primary mb-3">Get In Touch</h2>
                    <p className="text-xl text-accent max-w-2xl mx-auto text-slate-500">
                        We are ready to start the conversation about your financial goals.
                    </p>
                </div>
                <div className="flex flex-col lg:flex-row gap-12">
                    {/* Contact Information */}
                    <div className="lg:w-1/3 bg-primary p-8 rounded-xl shadow-2xl text-white">
                        <h3 className="text-2xl font-bold mb-6 border-b border-secondary pb-3">Contact Details</h3>
                        {/* ... (Contact details content) ... */}
                    </div>

                    {/* Contact Form */}
                    <ContactForm />
                </div>
            </div>
        </section>
    </main>
  );

  // --- UI COMPONENTS (CLIENT PORTAL) ---

  const StatCard = ({ title, value, color }) => (
    <div className={`p-5 rounded-xl shadow-md ${color === 'primary' ? 'bg-primary text-white' : 'bg-secondary text-primary'}`}>
        <p className="text-sm font-medium opacity-80">{title}</p>
        <p className="text-4xl font-extrabold mt-1">{value}</p>
    </div>
  );

  const ClientAppointmentCard = ({ appt }) => {
    const date = new Date(appt.dateTime);
    const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    
    // Mock handler for "Add to Calendar"
    const handleAddToCalendar = () => {
        // Mock functionality: does nothing but logs a message
        console.log(`Mock: Attempting to add appointment for ${appt.clientText} on ${date.toLocaleString()} to calendar.`);
    };

    return (
        <div className="p-4 bg-white rounded-lg shadow-md border border-blue-100 flex justify-between items-center transition hover:shadow-lg">
            <div>
                <p className="text-sm text-blue-600 font-semibold mb-1">{dateStr} at {timeStr}</p>
                {/* Display the topic or main part of clientText */}
                <p className="text-gray-800 font-medium">
                    Topic: {appt.clientText.split('(').length > 1 ? appt.clientText.split('(')[1]?.replace(')', '') : 'General Consultation'}
                </p>
                <p className="text-xs text-gray-500">
                    With: {MOCK_STAFF_DATA.find(s => s.id === appt.assignedTo)?.name || 'Team Member'}
                </p>
            </div>
            <button 
                onClick={handleAddToCalendar}
                className="bg-secondary text-primary px-3 py-1 rounded-full text-xs font-semibold hover:bg-amber-400 transition"
                title="Add this meeting to your external calendar"
            >
                Add to Calendar
            </button>
        </div>
    );
  };


  const ClientHome = ({ tickets, outstandingInvoices, appointments }) => {
    // For this mock, we assume the logged-in client is 'client@esco.cpa', which relates to 'Acme Solutions Inc.' in MOCK_CLIENTS_DATA.
    const MOCK_CLIENT_NAME_FRAGMENT = 'Acme Solutions'; 

    const upcomingAppointments = appointments
        .filter(appt => {
            const apptDate = new Date(appt.dateTime);
            const today = new Date();
            // Set today to midnight for comparison purposes
            today.setHours(0, 0, 0, 0); 
            
            // Filter by future date AND client name match
            return apptDate >= today && appt.clientText.includes(MOCK_CLIENT_NAME_FRAGMENT);
        })
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)); // Sort chronologically

    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-extrabold text-primary border-b pb-2">Your Dashboard</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Pending Invoices" value={outstandingInvoices.length} color="secondary" />
                <StatCard title="Active Support Tickets" value={tickets.filter(t => t.status !== 'Closed').length} color="primary" />
                <StatCard title="Documents Ready" value="2" color="secondary" />
            </div>

            {/* Upcoming Appointments Section */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Your Upcoming Appointments</h3>
                <div className="space-y-4">
                    {upcomingAppointments.length > 0 ? upcomingAppointments.map(appt => (
                        <ClientAppointmentCard key={appt.id} appt={appt} />
                    )) : (
                        <p className="text-gray-500 italic">You have no scheduled appointments at this time.</p>
                    )}
                </div>
            </div>

            {/* Messages from Esco CPA */}
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Messages from Esco CPA</h3>
                <ul className="space-y-3">
                    {MOCK_CLIENT_MESSAGES.map(msg => (
                        <li key={msg.id} className={`p-3 rounded-lg border flex justify-between items-center ${msg.type === 'Alert' ? 'bg-blue-50 border-blue-200' : 'bg-yellow-50 border-yellow-200'}`}>
                            <span className="font-medium text-gray-800 flex-1">
                                {msg.type === 'Action' ? '🚨 ACTION REQUIRED: ' : ''}
                                {msg.text}
                            </span>
                            <span className="text-xs text-gray-500 ml-4">{msg.date}</span>
                        </li>
                    ))}
                </ul>
                {MOCK_CLIENT_MESSAGES.length === 0 && <p className="text-gray-500">No new messages from your CPA team.</p>}
            </div>
        </div>
    );
  };

  const PortalMessages = ({ handleCreateTicket, tickets, user }) => {
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [subject, setSubject] = useState('');
    const [description, setDescription] = useState('');
    const [submitStatus, setSubmitStatus] = useState(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSubmitStatus(null);
        
        const result = await handleCreateTicket(subject, description);
        setSubmitStatus(result);
        
        if (result.success) {
            setSubject('');
            setDescription('');
            // Keep the form open for easy follow-up messages
        }
    };

    const getStatusClass = (status) => {
        switch (status) {
            case 'New': return 'bg-blue-100 text-blue-800';
            case 'In Progress': return 'bg-yellow-100 text-yellow-800';
            case 'Closed': return 'bg-green-100 text-green-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };
    
    // Pre-calculate the class string
    const statusClass = submitStatus?.success 
        ? 'bg-green-100 text-green-700' 
        : 'bg-red-100 text-red-700';

    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <h3 className="text-2xl font-bold text-primary">Private Messages & Support Tickets</h3>
            </div>
            <p className="text-gray-600 mb-4">Use this form to send a confidential, asynchronous message directly to your Esco CPA team (Jared, Cynthia, or Guadalupe).</p>

            {submitStatus && (
                <div className={`p-3 mb-4 rounded-lg ${statusClass}`}>
                    {submitStatus.message}
                </div>
            )}

            <form onSubmit={handleSubmit} className="mb-8 p-6 bg-gray-50 rounded-lg shadow-inner">
                <h4 className="text-xl font-semibold mb-4 text-primary">Send New Private Message</h4>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                    <input type="text" value={subject} onChange={(e) => setSubject(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"/>
                </div>
                <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Message Detail</label>
                    <textarea rows="4" value={description} onChange={(e) => setDescription(e.target.value)} required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-primary focus:border-primary"></textarea>
                </div>
                <button type="submit" className="bg-primary text-white px-6 py-2 rounded-lg font-semibold hover:bg-primary/90 transition">
                    Send Message to Admin
                </button>
                {user.isAnonymous && <p className="text-red-500 text-sm mt-2">Note: Anonymous users cannot send messages. Please register/log in.</p>}
            </form>

            <h4 className="text-xl font-semibold mb-3 text-primary border-t pt-4">Your Open Conversations</h4>
            {tickets.length > 0 ? (
                <div className="space-y-3">
                    {tickets.map(ticket => (
                        <div key={ticket.id} className="p-4 border border-gray-200 rounded-lg bg-white shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center">
                            <div className="flex-1">
                                <p className="font-semibold text-gray-900">{ticket.subject}</p>
                                <p className="text-xs text-gray-500 truncate">{ticket.description}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Opened: {ticket.createdAt ? new Date(ticket.createdAt.seconds * 1000).toLocaleDateString() : 'Loading...'}
                                </p>
                            </div>
                            <span className={`mt-2 sm:mt-0 px-3 py-1 text-xs font-semibold rounded-full ${getStatusClass(ticket.status)}`}>
                                {ticket.status}
                            </span>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-gray-500">You have no open messages or support tickets.</p>
            )}
        </div>
    );
  };


  const PortalInvoices = () => {
    // Mock Data filtered for client view (assuming this client has the outstanding invoice 'ESC-2024-001')
    const clientInvoices = MOCK_INVOICES_DATA.filter(i => i.client === 'Acme Solutions Inc.' || i.client === 'Jane Doe'); 
    
    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Invoices & Payment Status</h3>
            
            <div className="p-4 bg-red-100 text-red-800 rounded-lg mb-6 flex justify-between items-center">
                <span className="font-semibold text-lg">
                    Total Outstanding: ${clientInvoices.filter(i => i.status === 'Outstanding').reduce((sum, inv) => sum + inv.amount, 0).toFixed(2)}
                </span>
                <button disabled className="bg-red-500 text-white px-4 py-2 rounded-lg font-semibold opacity-50">
                    Pay All Outstanding (Mock)
                </button>
            </div>

            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-6 py-3"></th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {clientInvoices.map(inv => (
                        <tr key={inv.id}>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{inv.id}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{inv.date}</td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${inv.amount.toFixed(2)}</td>
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {inv.status}
                                </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                <button disabled={inv.status === 'Paid'} className={`font-semibold ${inv.status === 'Paid' ? 'text-gray-400 opacity-50' : 'text-primary hover:text-secondary'}`}>
                                    {inv.status === 'Paid' ? 'View Receipt' : 'Pay Now (Mock)'}
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            <p className="text-xs text-red-500 mt-4">Note: Payment integration requires a provider like Stripe.</p>
        </div>
    );
  };
  
  const PortalDocuments = () => (
    <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
        <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Document Upload & Download Center</h3>
        
        <div className="flex flex-col md:flex-row gap-8">
            <div className="md:w-1/2">
                <h4 className="text-xl font-semibold mb-3 text-primary">Upload Documents for Esco CPA</h4>
                <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg text-center bg-gray-50">
                    <input type="file" multiple className="hidden" id="file-upload" />
                    <label htmlFor="file-upload" className="cursor-pointer text-primary font-medium hover:text-secondary transition block py-6">
                        Click to select files (e.g., W-2s, bank statements, 1099s).
                    </label>
                    <p className="text-sm text-gray-500">Files will be securely stored in your private client folder.</p>
                </div>
                <button disabled className="mt-4 w-full bg-secondary text-primary font-bold py-2 rounded-lg opacity-50">
                    Secure Upload (Mock)
                </button>
                <p className="text-xs text-red-500 mt-2">Note: Real file storage (Firebase Storage) is required for real uploads.</p>
            </div>
            <div className="md:w-1/2">
                <h4 className="text-xl font-semibold mb-3 text-primary">Documents Shared by CPA</h4>
                <ul className="space-y-2">
                    {/* Using documents_shared based on global mock update */}
                    {MOCK_CLIENT_FILES['client-1'].documents_shared.map((doc, i) => (
                        <li key={i} className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                            <span>{doc.name}</span>
                            <a href="#" className="text-primary hover:text-secondary font-medium">Download</a>
                        </li>
                    ))}
                </ul>
                <p className="text-xs text-gray-500 mt-4">These documents are securely shared by your CPA team.</p>
            </div>
        </div>
    </div>
  );

  const PortalFinancials = () => (
    <div className="flex flex-col lg:flex-row gap-6 h-full">
        {/* Main P&L Content */}
        <div className="flex-1 p-6 bg-white rounded-xl shadow-lg border border-gray-100 overflow-y-auto">
            <div className="flex justify-between items-center mb-6 border-b pb-4">
                <div>
                    <h3 className="text-2xl font-bold text-primary">Profit & Loss Statement</h3>
                    <p className="text-sm text-gray-500">Synced from QuickBooks Online</p>
                </div>
                <div className="text-right">
                    <p className="text-xs text-gray-400">Last Updated</p>
                    <p className="font-semibold text-gray-700">{MOCK_FINANCIAL_DATA.lastUpdated}</p>
                </div>
            </div>

            {/* P&L Table */}
            <div className="space-y-6">
                {MOCK_FINANCIAL_DATA.pnl.map((category, idx) => (
                    <div key={idx}>
                        <h4 className="text-lg font-semibold text-gray-800 border-b border-gray-200 pb-1 mb-2">{category.category}</h4>
                        <ul className="space-y-2">
                            {category.items.map((item, i) => (
                                <li key={i} className="flex justify-between text-sm text-gray-600">
                                    <span>{item.name}</span>
                                    <span>${item.value.toLocaleString()}</span>
                                </li>
                            ))}
                        </ul>
                        <div className="flex justify-between font-bold text-gray-900 mt-2 pt-2 border-t border-gray-100">
                            <span>Total {category.category}</span>
                            <span>${category.total.toLocaleString()}</span>
                        </div>
                    </div>
                ))}
                
                {/* Net Income Highlight */}
                <div className="mt-8 p-4 bg-primary text-white rounded-lg flex justify-between items-center shadow-md">
                    <span className="text-xl font-bold">Net Income</span>
                    <span className="text-2xl font-extrabold">${MOCK_FINANCIAL_DATA.netIncome.toLocaleString()}</span>
                </div>
            </div>
        </div>

        {/* Admin Notes Sidebar */}
        <div className="w-full lg:w-80 p-6 bg-yellow-50 rounded-xl shadow-inner border border-yellow-100 flex flex-col">
            <h3 className="text-xl font-bold text-yellow-800 mb-4 flex items-center">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
                CPA Notes & Corrections
            </h3>
            <div className="space-y-4 overflow-y-auto flex-1">
                {MOCK_ADMIN_NOTES.map(note => (
                    <div key={note.id} className="bg-white p-3 rounded-lg shadow-sm border border-yellow-200">
                        <p className="text-xs text-gray-400 mb-1">{note.date} • {note.author}</p>
                        <p className="text-sm text-gray-800 italic">"{note.text}"</p>
                    </div>
                ))}
            </div>
            <div className="mt-4 pt-4 border-t border-yellow-200">
                <p className="text-xs text-yellow-700 text-center">Have questions about these notes? Send us a private message.</p>
            </div>
        </div>
    </div>
  );
  
  const PortalSettings = () => {
    // Mock selecting the current logged in client (client-1)
    const currentClient = clients.find(c => c.id === 'client-1') || MOCK_CLIENTS_DATA[0]; 
    
    const [isQuickBooksConnected, setIsQuickBooksConnected] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [formData, setFormData] = useState({
        contactPerson: currentClient.contactPerson,
        email: currentClient.email,
        phone: currentClient.phone,
        companyName: currentClient.companyName,
        companyAddress: currentClient.companyAddress,
        personalAddress: currentClient.personalAddress
    });

    const handleSave = () => {
        setIsEditing(false);
        // In a real app, this would send a Firestore update
        console.log("Saved profile data:", formData);
    };

    const handleChange = (e) => {
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };
    
    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 space-y-8">
            <h3 className="text-2xl font-bold text-primary border-b pb-2">Profile & Account Settings</h3>

            {/* My Information Section */}
            <div className="p-6 border rounded-xl shadow-sm bg-gray-50">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-xl font-semibold text-primary">My Information</h4>
                    <button 
                        onClick={() => isEditing ? handleSave() : setIsEditing(true)}
                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition ${isEditing ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-secondary text-primary hover:bg-amber-400'}`}
                    >
                        {isEditing ? 'Save Changes' : 'Edit Information'}
                    </button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Contact Person</label>
                        {isEditing ? (
                            <input name="contactPerson" value={formData.contactPerson} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800 font-medium">{formData.contactPerson}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Name</label>
                        {isEditing ? (
                            <input name="companyName" value={formData.companyName} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800 font-medium">{formData.companyName}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Email Address</label>
                        {isEditing ? (
                            <input name="email" value={formData.email} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800">{formData.email}</p>
                        )}
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Phone Number</label>
                        {isEditing ? (
                            <input name="phone" value={formData.phone} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800">{formData.phone}</p>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Company Address</label>
                        {isEditing ? (
                            <input name="companyAddress" value={formData.companyAddress} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800">{formData.companyAddress}</p>
                        )}
                    </div>
                    <div className="md:col-span-2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Personal Address</label>
                        {isEditing ? (
                            <input name="personalAddress" value={formData.personalAddress} onChange={handleChange} className="w-full p-2 border rounded" />
                        ) : (
                            <p className="text-gray-800">{formData.personalAddress}</p>
                        )}
                    </div>
                </div>
            </div>

            {/* QuickBooks Integration Section */}
            <div className="p-6 border rounded-xl shadow-inner space-y-4">
                <h4 className="text-xl font-semibold text-primary">QuickBooks Integration</h4>
                <p className="text-gray-600">
                    Connect your QuickBooks Online account to allow your Esco CPA team to securely access the necessary financial data for seamless tax preparation and consulting services.
                </p>
                <div className="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
                    <span className="font-medium">Connection Status:</span>
                    <span className={`px-3 py-1 text-sm font-bold rounded-full ${isQuickBooksConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {isQuickBooksConnected ? 'CONNECTED' : 'NOT CONNECTED'}
                    </span>
                </div>
                <button 
                    onClick={() => setIsQuickBooksConnected(!isQuickBooksConnected)}
                    className={`px-6 py-2 rounded-lg font-semibold text-white transition ${isQuickBooksConnected ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
                >
                    {isQuickBooksConnected ? 'Disconnect QuickBooks' : 'Connect QuickBooks (Mock)'}
                </button>
                <p className="text-xs text-red-500 mt-2">Note: This is a connection mock. Real integration requires OAuth setup with Intuit.</p>
            </div>
        </div>
    );
  };
  
  const ClientPortal = ({ appointments }) => {
    // If user is not authenticated or not ready, redirect or show message
    if (!user || userRole !== 'client') {
        return (
            <div className="min-h-screen pt-24 bg-gray-50 flex items-center justify-center">
                <div className="p-10 bg-white rounded-xl shadow-2xl text-center max-w-lg">
                    <h2 className="text-3xl font-bold text-red-600 mb-4">Access Denied</h2>
                    <p className="text-lg text-gray-600 mb-6">You must be logged in as a client to access this portal.</p>
                    <button onClick={() => setView('login')} className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition">
                        Go to Login Page
                    </button>
                </div>
            </div>
        );
    }
    
    // Mock outstanding invoices specific to client-1
    const outstandingInvoices = MOCK_INVOICES_DATA.filter(i => i.client === 'Acme Solutions Inc.' && i.status === 'Outstanding');

    const navItemClass = (currentView) => 
        `flex items-center space-x-3 px-4 py-3 rounded-lg transition duration-200 cursor-pointer 
        ${clientView === currentView 
            ? 'bg-secondary text-primary font-bold shadow-md' 
            : 'text-white hover:bg-primary/80'
        }`;

    let CurrentView;
    switch (clientView) {
        case 'messages': CurrentView = <PortalMessages handleCreateTicket={handleCreateTicket} tickets={tickets} user={user} />; break;
        case 'financials': CurrentView = <PortalFinancials />; break;
        case 'invoices': CurrentView = <PortalInvoices />; break;
        case 'documents': CurrentView = <PortalDocuments />; break;
        case 'settings': CurrentView = <PortalSettings />; break;
        case 'home':
        default: CurrentView = <ClientHome 
                                    tickets={tickets} 
                                    outstandingInvoices={outstandingInvoices} 
                                    appointments={appointments} 
                                />;
    }

    return (
        <main className="min-h-screen pt-16 flex bg-gray-100">
            {/* Sidebar Menu */}
            <nav className="w-64 bg-primary p-4 pt-8 h-screen sticky top-16 shadow-2xl hidden md:block">
                <h2 className="text-2xl font-bold text-secondary mb-8">Client Menu</h2>
                <ul className="space-y-2">
                    <li>
                        <button onClick={() => setClientView('home')} className={navItemClass('home')}>
                            {/* Dashboard Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-layout-dashboard"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>
                            <span>Home (Dashboard)</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setClientView('messages')} className={navItemClass('messages')}>
                            {/* Message Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-message-circle"><path d="M7.9 20.91A10 10 0 1 0 3 13.5v-1.39C3 11.5 3 10.5 3 9.5"/></svg>
                            <span>Private Messages</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setClientView('financials')} className={navItemClass('financials')}>
                            {/* Financials Icon (Pie Chart) */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-pie-chart"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"/><path d="M22 12A10 10 0 0 0 12 2v10z"/></svg>
                            <span>Financials (P&L)</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setClientView('invoices')} className={navItemClass('invoices')}>
                            {/* Invoice Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-wallet"><path d="M21 12V7H5a2 2 0 0 1 0-4h16v5"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12h-2"/><path d="M12 17h-1"/><path d="M16 17h-1"/></svg>
                            <span>Invoices & Payments</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setClientView('documents')} className={navItemClass('documents')}>
                            {/* Document Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-cloud-upload"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.5"/><path d="m11 17 3-3-3-3"/><path d="M14 14h-10"/></svg>
                            <span>Document Center</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => setClientView('settings')} className={navItemClass('settings')}>
                            {/* Settings Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.75 1.3a2 2 0 0 0 .73 2.73l.15.08a2 2 0 0 1 1 1.73v.44a2 2 0 0 1-1 1.73l-.15.08a2 2 0 0 0-.73 2.73l.75 1.3a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 1-1.73v.18a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.75-1.3a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>Settings (QuickBooks)</span>
                        </button>
                    </li>
                </ul>
                <p className="text-xs text-gray-500 mt-8 text-center">Client ID: {user?.uid || 'N/A'}</p>
            </nav>

            {/* Main Content Area */}
            <section className="flex-1 p-4 md:p-8 pt-24 min-h-screen overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                    {CurrentView}
                </div>
            </section>
        </main>
    );
  };
  
  // --- UI COMPONENTS (ADMIN PORTAL) ---

  const AppointmentCard = ({ appt, staff }) => {
    const assignedStaff = staff.find(s => s.id === appt.assignedTo)?.name.split(' ')[0] || 'Unassigned';
    const date = new Date(appt.dateTime);
    
    // Check if the appointment is today
    const isToday = date.toDateString() === new Date().toDateString();

    const statusClass = appt.status === 'Confirmed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800';
    
    return (
        <div className={`p-4 rounded-lg border border-gray-200 shadow-sm ${isToday ? 'bg-secondary/10 border-secondary' : 'bg-white'}`}>
            <div className="flex justify-between items-center mb-1">
                <p className="font-bold text-lg text-primary">{date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${statusClass}`}>
                    {appt.status}
                </span>
            </div>
            <p className="text-gray-700 font-medium truncate">{appt.clientText}</p>
            <p className="text-sm text-gray-500 mt-1">
                Date: {date.toLocaleDateString()} | Assigned to: <span className="font-semibold">{assignedStaff}</span>
            </p>
        </div>
    );
  };

  const AdminHome = ({ todos, staff, handleAssignTask, appointments }) => {
    const pendingTodos = todos.filter(t => !t.done);
    const staffMap = staff.reduce((acc, member) => {
        acc[member.id] = member.name.split(' ')[0];
        return acc;
    }, {});
    
    // Logic for Upcoming Appointments
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const upcomingAppointments = appointments
        .filter(appt => new Date(appt.dateTime) >= today)
        .sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime))
        .slice(0, 4); // Show top 4 upcoming appointments

    const getTaskStyle = (color) => `text-white px-2 py-0.5 rounded-full text-xs font-semibold bg-${color}`;
    
    return (
        <div className="space-y-8">
            <h2 className="text-3xl font-extrabold text-primary border-b pb-2">Admin Home Dashboard</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <StatCard title="Active Clients" value={clients.filter(c => c.status === 'Active').length} color="primary" />
                <StatCard title="Pending Invoices" value={MOCK_INVOICES_DATA.filter(i => i.status === 'Outstanding').length} color="secondary" />
                <StatCard title="Unreviewed Tickets" value="1" color="primary" />
            </div>

            {/* UPCOMING APPOINTMENTS SECTION */}
            <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-100">
                <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Upcoming Appointments</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {upcomingAppointments.length > 0 ? upcomingAppointments.map(appt => (
                        <AppointmentCard key={appt.id} appt={appt} staff={staff} />
                    )) : (
                        <p className="col-span-2 text-gray-500 italic">No upcoming appointments scheduled.</p>
                    )}
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Pending To-Do Tasks ({pendingTodos.length})</h3>
                <ul className="space-y-3">
                    {pendingTodos.length > 0 ? pendingTodos.map(todo => (
                        <li key={todo.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div className="flex-1 space-y-1 sm:space-y-0">
                                <p className="text-gray-800 font-medium">{todo.task}</p>
                                <span className={getTaskStyle(todo.color)}>{todo.priority}</span>
                                {todo.clientId && <span className="ml-2 text-xs text-gray-500">(Client-Linked)</span>}
                            </div>
                            <div className="mt-2 sm:mt-0 flex items-center space-x-2">
                                <span className="text-sm text-gray-600">Assigned:</span>
                                <select 
                                    value={todo.assignedTo || ''}
                                    onChange={(e) => handleAssignTask(todo.id, e.target.value || null)}
                                    className="p-1 border rounded-lg bg-white text-sm"
                                >
                                    <option value="">Unassigned</option>
                                    {staff.filter(m => m.status === 'Active').map(member => (
                                        <option key={member.id} value={member.id}>{member.name.split(' ')[0]}</option>
                                    ))}
                                </select>
                            </div>
                        </li>
                    )) : (
                        <li className="text-green-600 font-semibold">Great work! All priority tasks are completed.</li>
                    )}
                </ul>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-lg">
                <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">Tasks Assigned to Team</h3>
                <div className="space-y-4">
                    {staff.map(member => (
                        <div key={member.id} className="p-3 bg-blue-50 rounded-lg">
                            <p className="font-semibold text-primary">{member.name}:</p>
                            <ul className="list-disc list-inside text-sm text-gray-700 mt-1 pl-4">
                                {todos.filter(t => t.assignedTo === member.id && !t.done).map(t => (
                                    <li key={t.id}>{t.task}</li>
                                ))}
                                {todos.filter(t => t.assignedTo === member.id && !t.done).length === 0 && (
                                    <li className="text-gray-500">No current assignments.</li>
                                )}
                            </ul>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
  };
  
  const AdminClients = ({ onSelectClient }) => {
    const getAssignedStaff = (clientId) => {
        const client = clients.find(c => c.id === clientId);
        const staffMember = MOCK_STAFF_DATA.find(s => s.id === client?.assignedTo);
        return staffMember ? staffMember.name.split(' ')[0] : 'Unassigned';
    };
    
    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
            <h3 className="text-2xl font-bold text-primary mb-4 border-b pb-2">All Client List (CRM)</h3>
            <p className="text-sm text-red-500 mb-4">
                NOTE: Staff members (Cynthia/Guadalupe) would only see clients assigned to them via Firebase Security Rules, but Jared (Power User) sees all.
            </p>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client / Company</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Contact</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned Staff</th>
                            <th className="px-6 py-3">Action</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {clients.map(client => (
                            <tr key={client.id} className="hover:bg-gray-50 cursor-pointer">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm font-bold text-gray-900">{client.companyName}</div>
                                    <div className="text-xs text-gray-500">{client.contactPerson}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <div className="text-sm text-gray-900">{client.email}</div>
                                    <div className="text-xs text-gray-500">{client.phone}</div>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${client.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {client.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{getAssignedStaff(client.id)}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    <button 
                                        onClick={() => onSelectClient(client.id)}
                                        className="text-primary hover:text-secondary font-semibold"
                                    >
                                        View CRM File
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
  };

  const AdminClientFile = ({ clientId, onBack, todos, handleCreateClientTask, onOpenDocument, onOpenSendModal }) => {
    const client = clients.find(c => c.id === clientId);
    // Updated file structure access to reflect mock data changes
    const file = MOCK_CLIENT_FILES[clientId] || { documents_shared: [], documents_received: [], invoices: [], tickets: [], payments: [] };
    const [clientFileTab, setClientFileTab] = useState('documents'); // 'documents', 'invoices', 'tickets', 'quickbooks', 'payments', 'tasks'
    
    // Form state for adding a new task
    const [newTaskText, setNewTaskText] = useState('');
    const [newTaskPriority, setNewTaskPriority] = useState('Medium');
    const [newTaskAssignee, setNewTaskAssignee] = useState('');

    if (!client) return <div className="p-6 text-red-500">Client file not found.</div>;

    const assignedStaff = MOCK_STAFF_DATA.find(s => s.id === client.assignedTo)?.name || 'Unassigned';

    const tabClass = (tab) => 
        `px-4 py-2 font-semibold border-b-2 transition duration-200 whitespace-nowrap ${
            clientFileTab === tab 
            ? 'border-secondary text-primary' 
            : 'border-transparent text-gray-500 hover:border-gray-300'
        }`;

    const submitTask = (e) => {
        e.preventDefault();
        if(!newTaskText) return;
        handleCreateClientTask(clientId, newTaskText, newTaskPriority, newTaskAssignee);
        setNewTaskText('');
        setNewTaskAssignee('');
        setNewTaskPriority('Medium');
    };

    const renderClientContent = () => {
        switch (clientFileTab) {
            case 'tasks':
                const clientTasks = todos.filter(t => t.clientId === clientId);
                return (
                    <div className="space-y-6">
                        <div className="p-4 bg-white rounded-lg border shadow-sm">
                            <h4 className="text-lg font-semibold text-primary mb-3">Create New Task for {client.contactPerson}</h4>
                            <form onSubmit={submitTask} className="flex flex-col md:flex-row gap-3 items-end">
                                <div className="flex-1 w-full">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Task Description</label>
                                    <input 
                                        type="text" 
                                        value={newTaskText} 
                                        onChange={e => setNewTaskText(e.target.value)}
                                        placeholder="e.g., Request Bank Statements"
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                    />
                                </div>
                                <div className="w-full md:w-32">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Priority</label>
                                    <select 
                                        value={newTaskPriority}
                                        onChange={e => setNewTaskPriority(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                    >
                                        <option>High</option>
                                        <option>Medium</option>
                                        <option>Low</option>
                                    </select>
                                </div>
                                <div className="w-full md:w-40">
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Assign To</label>
                                    <select 
                                        value={newTaskAssignee}
                                        onChange={e => setNewTaskAssignee(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg text-sm"
                                    >
                                        <option value="">Unassigned</option>
                                        {MOCK_STAFF_DATA.map(s => <option key={s.id} value={s.id}>{s.name.split(' ')[0]}</option>)}
                                    </select>
                                </div>
                                <button type="submit" className="bg-secondary text-primary font-bold px-4 py-2 rounded-lg text-sm hover:bg-amber-400 w-full md:w-auto">
                                    Add Task
                                </button>
                            </form>
                        </div>

                        <h4 className="text-xl font-semibold">Active Tasks</h4>
                        {clientTasks.length > 0 ? (
                            <ul className="space-y-2">
                                {clientTasks.map(task => (
                                    <li key={task.id} className="flex justify-between items-center p-3 bg-white border rounded-lg">
                                        <div>
                                            <p className={`font-medium ${task.done ? 'line-through text-gray-400' : 'text-gray-800'}`}>{task.task}</p>
                                            <p className="text-xs text-gray-500">
                                                Priority: <span className={`text-${task.color}`}>{task.priority}</span> | 
                                                Assigned: {MOCK_STAFF_DATA.find(s => s.id === task.assignedTo)?.name || 'Unassigned'}
                                            </p>
                                        </div>
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${task.done ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {task.done ? 'Done' : 'Pending'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500 italic">No active tasks for this client.</p>
                        )}
                    </div>
                );
            case 'documents':
                // New logic for splitting Shared and Received documents
                return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Shared by CPA (Firm -> Client) */}
                        <div className="space-y-4">
                            <h4 className="text-xl font-semibold mb-2 text-primary">Shared by CPA ({file.documents_shared.length})</h4>
                            <p className="text-sm text-gray-500">Documents finalized and shared with the client.</p>
                            {file.documents_shared.length > 0 ? file.documents_shared.map((doc, i) => (
                                <div key={i} className="p-3 bg-white rounded-lg border border-gray-200 flex justify-between items-center shadow-sm">
                                    <button 
                                        onClick={() => onOpenDocument(doc.name, doc.content, doc.requiresSignature)}
                                        className="font-medium text-primary hover:text-secondary text-left text-sm truncate"
                                    >
                                        {doc.name}
                                    </button>
                                    <div className="text-xs text-gray-500 flex flex-col items-end">
                                        <span>{doc.size}</span>
                                        <span>{doc.date}</span>
                                    </div>
                                </div>
                            )) : <p className="text-gray-500 italic">No documents shared by CPA.</p>}
                        </div>

                        {/* Received from Client (Client -> Firm) */}
                        <div className="space-y-4">
                            <h4 className="text-xl font-semibold mb-2 text-primary">Received from Client ({file.documents_received.length})</h4>
                            <p className="text-sm text-gray-500">Raw documents uploaded by the client (e.g., bank statements).</p>
                            {file.documents_received.length > 0 ? file.documents_received.map((doc, i) => (
                                <div key={i} className="p-3 bg-gray-100 rounded-lg border border-gray-300 flex justify-between items-center">
                                    <span className="font-medium text-gray-800 text-sm truncate">
                                        {doc.name}
                                    </span>
                                    <div className="text-xs text-gray-500 flex flex-col items-end">
                                        <span>{doc.size}</span>
                                        <span>{doc.date}</span>
                                    </div>
                                </div>
                            )) : <p className="text-gray-500 italic">No recent client uploads.</p>}
                        </div>
                    </div>
                );
            case 'invoices':
                 return (
                    <div className="space-y-4">
                        <h4 className="text-xl font-semibold mb-4">Client Invoices</h4>
                        <button disabled className="bg-secondary text-primary px-4 py-2 rounded-lg font-semibold opacity-50 mb-4">Generate New Invoice (Mock)</button>
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {file.invoices.map(inv => (
                                    <tr key={inv.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                            <button 
                                                onClick={() => onOpenDocument(`Invoice ${inv.id}`, inv.content, false)}
                                                className="text-primary hover:text-secondary font-medium"
                                            >
                                                {inv.id}
                                            </button>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{inv.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${inv.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                                {inv.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                                            <button 
                                                onClick={() => onOpenSendModal('invoice', [{ id: inv.id, name: `Invoice ${inv.id}` }])} 
                                                className="text-sm text-primary hover:text-secondary font-semibold"
                                            >
                                                Send
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            case 'tickets':
                return (
                    <div className="space-y-4">
                        <h4 className="text-xl font-semibold mb-2">Support Tickets</h4>
                         {file.tickets.length > 0 ? file.tickets.map((t, i) => (
                            <div key={i} className="p-3 bg-gray-50 rounded-lg border flex justify-between items-center">
                                <span className="font-medium text-gray-900">{t.subject}</span>
                                <span className={`px-2 py-0.5 text-xs rounded-full ${t.status === 'New' ? 'bg-blue-100 text-blue-800' : 'bg-gray-200 text-gray-700'}`}>{t.status}</span>
                            </div>
                        )) : <p>No tickets found.</p>}
                    </div>
                );
            case 'quickbooks':
                return (
                    <div className="space-y-4 p-6 bg-blue-50 rounded-lg">
                        <h4 className="text-xl font-semibold mb-2 text-primary">QuickBooks / Accounting View (Integration Mock)</h4>
                        <p className="text-gray-600">
                            This section would display synchronized financial data (P&L, Balance Sheet, Trial Balance) from the client's connected QuickBooks account.
                        </p>
                        <p className="text-sm text-blue-700 font-medium">Status: Last Sync: 5 hours ago.</p>
                        <button disabled className="bg-primary text-white px-4 py-2 rounded-lg font-semibold opacity-50">View Financial Reports</button>
                    </div>
                );
             case 'payments':
                return (
                    <div className="space-y-4">
                        <h4 className="text-xl font-semibold mb-2">Payment and Order History</h4>
                        <table className="min-w-full divide-y divide-gray-200">
                             <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment ID</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                </tr>
                            </thead>
                             <tbody className="bg-white divide-y divide-gray-200">
                                {file.payments.map(p => (
                                    <tr key={p.id}>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{p.id}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.date}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${p.amount.toFixed(2)}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{p.method}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );
            default: return null;
        }
    };

    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100">
            <button 
                onClick={onBack}
                className="text-gray-600 hover:text-primary mb-4 flex items-center text-sm"
            >
                &larr; Back to Client List
            </button>
            
            {/* CRM HEADER SECTION */}
            <div className="border-b pb-6 mb-6">
                <div className="flex justify-between items-start">
                    <div>
                        <h2 className="text-3xl font-bold text-primary">{client.companyName}</h2>
                        <p className="text-lg text-gray-600 font-medium">{client.contactPerson}</p>
                        <span className={`inline-block mt-2 px-3 py-1 text-xs font-semibold rounded-full ${client.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {client.status}
                        </span>
                    </div>
                    <div className="text-right">
                        <p className="text-sm text-gray-500">Account Manager</p>
                        <p className="font-semibold text-primary">{assignedStaff}</p>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6 bg-gray-50 p-4 rounded-lg">
                    <div>
                        <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Contact Information</h5>
                        <p className="text-sm text-gray-700 flex items-center mb-1">
                            <span className="font-semibold w-16">Email:</span> {client.email}
                        </p>
                        <p className="text-sm text-gray-700 flex items-center">
                            <span className="font-semibold w-16">Phone:</span> {client.phone}
                        </p>
                    </div>
                    <div>
                        <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Addresses</h5>
                        <div className="mb-2">
                            <p className="text-xs font-semibold text-gray-500">Company Address:</p>
                            <p className="text-sm text-gray-700">{client.companyAddress}</p>
                        </div>
                        <div>
                            <p className="text-xs font-semibold text-gray-500">Personal Address:</p>
                            <p className="text-sm text-gray-700">{client.personalAddress}</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* CRM TABS */}
            <nav className="flex space-x-4 mb-6 overflow-x-auto pb-2">
                <button onClick={() => setClientFileTab('tasks')} className={tabClass('tasks')}>Tasks</button>
                <button onClick={() => setClientFileTab('documents')} className={tabClass('documents')}>Documents</button>
                <button onClick={() => setClientFileTab('invoices')} className={tabClass('invoices')}>Invoices</button>
                <button onClick={() => setClientFileTab('tickets')} className={tabClass('tickets')}>Support Tickets</button>
                <button onClick={() => setClientFileTab('payments')} className={tabClass('payments')}>Payments</button>
                <button onClick={() => setClientFileTab('quickbooks')} className={tabClass('quickbooks')}>QuickBooks</button>
            </nav>
            
            <div className="p-4 bg-gray-50 rounded-lg">
                {renderClientContent()}
            </div>
        </div>
    );
  };

  // ... (AdminInvoices and AdminSettings remain the same)
  
  const AdminInvoices = ({ onOpenSendModal }) => {
    const [selectedInvoices, setSelectedInvoices] = useState([]);
    const outstandingInvoices = MOCK_INVOICES_DATA.filter(i => i.status === 'Outstanding');
    const paidInvoices = MOCK_INVOICES_DATA.filter(i => i.status === 'Paid');
    
    const handleSelectInvoice = (invoiceId) => {
        setSelectedInvoices(prev => 
            prev.includes(invoiceId) 
                ? prev.filter(id => id !== invoiceId)
                : [...prev, invoiceId]
        );
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedInvoices(MOCK_INVOICES_DATA.map(i => i.id));
        } else {
            setSelectedInvoices([]);
        }
    };
    
    const selectedInvoiceItems = MOCK_INVOICES_DATA
        .filter(i => selectedInvoices.includes(i.id))
        .map(i => ({ id: i.id, name: `Invoice ${i.id} (${i.client})` }));

    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 space-y-8">
            <h3 className="text-2xl font-bold text-primary border-b pb-2">Invoice Management (Firm Overview)</h3>
            
            <div className="flex space-x-4">
                <div className="p-4 bg-red-50 rounded-lg w-1/2">
                    <p className="font-semibold text-lg text-red-800">Total Outstanding: {outstandingInvoices.length}</p>
                    <p className="text-3xl font-bold text-red-900">${outstandingInvoices.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2)}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg w-1/2">
                    <p className="font-semibold text-lg text-green-800">Total Paid: {paidInvoices.length}</p>
                    <p className="text-3xl font-bold text-green-900">${paidInvoices.reduce((sum, inv) => sum + inv.amount, 0).toFixed(2)}</p>
                </div>
            </div>

            {/* Bulk Actions */}
            <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-lg border">
                <p className="font-medium text-primary">Selected: {selectedInvoices.length} invoices</p>
                <button 
                    onClick={() => onOpenSendModal('invoice', selectedInvoiceItems)}
                    disabled={selectedInvoices.length === 0}
                    className={`px-4 py-2 rounded-lg font-semibold transition ${selectedInvoices.length > 0 ? 'bg-primary text-white hover:bg-primary/90' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                >
                    Send Selected (Mock)
                </button>
            </div>

            <div className="overflow-x-auto">
                <h4 className="text-xl font-semibold text-primary mb-3">All Invoices</h4>
                 <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="p-3 text-left w-10">
                                <input 
                                    type="checkbox" 
                                    checked={selectedInvoices.length === MOCK_INVOICES_DATA.length && MOCK_INVOICES_DATA.length > 0}
                                    onChange={handleSelectAll}
                                    className="rounded text-primary focus:ring-primary"
                                />
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice #</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {MOCK_INVOICES_DATA.map(inv => (
                            <tr key={inv.id} className="hover:bg-gray-50">
                                <td className="p-3 whitespace-nowrap">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedInvoices.includes(inv.id)}
                                        onChange={() => handleSelectInvoice(inv.id)}
                                        className="rounded text-primary focus:ring-primary"
                                    />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{inv.id}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{inv.client}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{inv.date}</td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${inv.amount.toFixed(2)}</td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${inv.status === 'Paid' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                        {inv.status}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
  };
  
  const AdminSettings = ({ staff, handleToggleStaffStatus, userRole }) => (
    <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 space-y-8">
        <h3 className="text-2xl font-bold text-primary border-b pb-2">Admin Settings & User Management</h3>
        
        {userRole !== 'admin' ? (
            <div className="p-4 bg-red-100 text-red-800 rounded-lg">
                Only the **Power User (Jared Escobar)** can manage staff permissions and status.
            </div>
        ) : (
            <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <h4 className="text-xl font-semibold text-primary">Esco CPA Staff Permissions</h4>
                <p className="text-gray-600">
                    Control access for your team. Only the Power User can change roles and status. Status controls who appears in the assignment dropdown.
                </p>
                <div className="space-y-3">
                    {staff.map(member => (
                        <div key={member.id} className="flex justify-between items-center p-3 border rounded-lg bg-white shadow-sm">
                            <div>
                                <p className="font-bold text-gray-900">{member.name}</p>
                                <p className="text-sm text-gray-500">{member.role}</p>
                            </div>
                            <div className="flex items-center space-x-4">
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${member.status === 'Active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                    {member.status}
                                </span>
                                {member.role !== 'Power User' && (
                                    <button 
                                        onClick={() => handleToggleStaffStatus(member.id)}
                                        className={`px-3 py-1 text-sm font-medium rounded-lg transition ${member.status === 'Active' ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'} text-white`}
                                    >
                                        {member.status === 'Active' ? 'Deactivate' : 'Activate'}
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )}
        
        <div className="p-4 bg-gray-50 rounded-lg">
            <h4 className="text-xl font-semibold text-primary">Add New Staff (Mock)</h4>
            <p className="text-gray-600">Simulate adding a new team member to the firm's system.</p>
            <button disabled className="mt-3 bg-gray-400 text-white px-4 py-2 rounded-lg font-semibold opacity-50">
                Invite New Staff
            </button>
        </div>
    </div>
  );

  const CreateAppointmentForm = ({ staff, handleCreateAppointment }) => {
    const [dateTime, setDateTime] = useState('');
    const [clientText, setClientText] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [message, setMessage] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!dateTime || !clientText || !assignedTo) {
            setMessage('Please fill out all fields.');
            return;
        }

        handleCreateAppointment({
            dateTime,
            clientText,
            assignedTo,
        });

        // Reset form
        setDateTime('');
        setClientText('');
        setAssignedTo('');
        setMessage('Appointment successfully scheduled!');
        setTimeout(() => setMessage(''), 3000);
    };

    return (
        <div className="p-6 bg-blue-50 rounded-xl shadow-inner border border-blue-200">
            <h4 className="text-xl font-bold text-primary mb-4 border-b border-blue-200 pb-2">Schedule New Appointment</h4>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Date/Time Input */}
                    <div>
                        <label htmlFor="dateTime" className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
                        <input
                            type="datetime-local"
                            id="dateTime"
                            value={dateTime}
                            onChange={(e) => setDateTime(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-secondary focus:border-secondary"
                        />
                    </div>
                    {/* Assigned To */}
                    <div>
                        <label htmlFor="assignedTo" className="block text-sm font-medium text-gray-700 mb-1">Assigned To User</label>
                        <select
                            id="assignedTo"
                            value={assignedTo}
                            onChange={(e) => setAssignedTo(e.target.value)}
                            required
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-secondary focus:border-secondary bg-white"
                        >
                            <option value="" disabled>Select Staff Member</option>
                            {staff.filter(m => m.status === 'Active').map(member => (
                                <option key={member.id} value={member.id}>{member.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
                {/* Client Text Input */}
                <div>
                    <label htmlFor="clientText" className="block text-sm font-medium text-gray-700 mb-1">Client (Text Entry)</label>
                    <input
                        type="text"
                        id="clientText"
                        value={clientText}
                        onChange={(e) => setClientText(e.target.value)}
                        required
                        placeholder="e.g., Jane Doe (Tax Review) or Acme Solutions (Q4 Planning)"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-secondary focus:border-secondary"
                    />
                </div>
                <button type="submit" className="w-full bg-primary text-white py-2 rounded-lg font-bold hover:bg-primary/90 transition shadow-md">
                    Create Appointment
                </button>
                {message && (
                    <div className={`mt-4 p-3 rounded-lg text-center ${message.includes('successfully') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`} role="alert">
                        {message}
                    </div>
                )}
            </form>
        </div>
    );
  };

  const AppointmentModule = ({ appointments, staff, handleCreateAppointment }) => {
    // Sort appointments by date time ascending
    const sortedAppointments = useMemo(() => 
        [...appointments].sort((a, b) => new Date(a.dateTime) - new Date(b.dateTime)), 
        [appointments]
    );

    const getStaffName = (staffId) => staff.find(s => s.id === staffId)?.name || 'N/A';
    
    return (
        <div className="p-6 bg-white rounded-xl shadow-lg border border-gray-100 space-y-8">
            <h3 className="text-2xl font-bold text-primary border-b pb-2">Appointment Management</h3>

            <CreateAppointmentForm staff={staff} handleCreateAppointment={handleCreateAppointment} />

            {/* Appointment List */}
            <div>
                <h4 className="text-xl font-bold text-primary mb-4 border-b pb-2">All Scheduled Appointments ({sortedAppointments.length})</h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date & Time</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client / Topic</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {sortedAppointments.map(appt => (
                                <tr key={appt.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                        {new Date(appt.dateTime).toLocaleString()}
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{appt.clientText}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">{getStaffName(appt.assignedTo)}</td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${appt.status === 'Confirmed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                                            {appt.status}
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
  };


  const AdminPortal = () => {
    const [adminView, setAdminView] = useState('home');
    const [selectedClientId, setSelectedClientId] = useState(null);

    // Mock role check (Jared is the only Admin mock that matters for now)
    const isPowerUser = userRole === 'admin'; 

    if (!isPowerUser) { 
        return (
            <div className="min-h-screen pt-24 bg-gray-50 flex items-center justify-center">
                <div className="p-10 bg-white rounded-xl shadow-2xl text-center max-w-lg">
                    <h2 className="text-3xl font-bold text-red-600 mb-4">Admin Access Required</h2>
                    <p className="text-lg text-gray-600 mb-6">Staff credentials are required for this portal.</p>
                    <button onClick={() => setView('login')} className="bg-primary text-white px-6 py-3 rounded-lg font-semibold hover:bg-primary/90 transition">
                        Go to Login Page
                    </button>
                </div>
            </div>
        );
    }
    
    // Determine the main content component
    let CurrentAdminView;
    if (selectedClientId) {
        CurrentAdminView = (
            <AdminClientFile 
                clientId={selectedClientId} 
                onBack={() => setSelectedClientId(null)} 
                todos={todos}
                handleCreateClientTask={handleCreateClientTask}
                onOpenDocument={handleOpenDocument}
                onOpenSendModal={handleOpenSendModal}
            />
        );
    } else {
        switch (adminView) {
            case 'clients': CurrentAdminView = <AdminClients onSelectClient={setSelectedClientId} />; break;
            case 'invoices': CurrentAdminView = <AdminInvoices onOpenSendModal={handleOpenSendModal} />; break;
            case 'appointments': CurrentAdminView = <AppointmentModule appointments={appointments} staff={staff} handleCreateAppointment={handleCreateAppointment} />; break;
            case 'settings': CurrentAdminView = <AdminSettings staff={staff} handleToggleStaffStatus={handleToggleStaffStatus} userRole={userRole} />; break;
            case 'home':
            default: CurrentAdminView = <AdminHome todos={todos} staff={staff} handleAssignTask={handleAssignTask} appointments={appointments} />;
        }
    }

    const navItemClass = (currentView) => 
        `flex items-center space-x-3 px-4 py-3 rounded-lg transition duration-200 cursor-pointer 
        ${adminView === currentView 
            ? 'bg-secondary text-primary font-bold shadow-md' 
            : 'text-white hover:bg-primary/80'
        }`;
        
    return (
        <main className="min-h-screen pt-16 flex bg-gray-100">
            {/* Modals placed above everything else in main content flow */}
            <DocumentViewModal 
                isOpen={documentModal.isOpen} 
                title={documentModal.title} 
                content={documentModal.content}
                requiresSignature={documentModal.requiresSignature}
                isSigned={documentModal.isSigned}
                onClose={() => setDocumentModal({ isOpen: false, title: '', content: '', requiresSignature: false, isSigned: false })}
                onSend={(type, items) => { 
                    setDocumentModal({ isOpen: false, title: '', content: '', requiresSignature: false, isSigned: false });
                    handleOpenSendModal(type, items);
                }}
                onPrint={handlePrint}
                onSignDocument={handleDocumentSign} // Pass the new handler
            />
            <SendDocumentModal 
                isOpen={sendModal.isOpen}
                type={sendModal.type}
                items={sendModal.items}
                onClose={() => setSendModal({ isOpen: false, type: null, items: [] })}
            />
            <CreateClientModal
                isOpen={createClientModalOpen}
                onClose={() => setCreateClientModalOpen(false)}
                onCreateClient={handleCreateClient}
                staff={staff}
            />


            {/* Sidebar Menu */}
            <nav className={`w-64 bg-primary p-4 pt-8 h-screen sticky top-16 shadow-2xl ${selectedClientId ? 'hidden lg:block' : 'block'}`}>
                <h2 className="text-2xl font-bold text-secondary mb-8">Admin Menu</h2>
                
                {/* NEW CLIENT BUTTON */}
                <button
                    onClick={() => setCreateClientModalOpen(true)}
                    className="flex items-center justify-center w-full space-x-2 px-4 py-3 mb-6 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition shadow-xl"
                >
                    {/* Plus Icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-plus"><path d="M12 5v14"/><path d="M5 12h14"/></svg>
                    <span>New Client</span>
                </button>

                <ul className="space-y-2">
                    <li>
                        <button onClick={() => { setAdminView('home'); setSelectedClientId(null); }} className={navItemClass('home')}>
                            {/* Home Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-home"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                            <span>Home (To-Do)</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setAdminView('clients'); setSelectedClientId(null); }} className={navItemClass('clients')}>
                            {/* Users Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-users"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span>Clients</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setAdminView('appointments'); setSelectedClientId(null); }} className={navItemClass('appointments')}>
                             {/* Calendar Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-calendar-check"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/><path d="m9 16 2 2 4-4"/></svg>
                            <span>Appointments</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setAdminView('invoices'); setSelectedClientId(null); }} className={navItemClass('invoices')}>
                            {/* Invoice Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-file-text"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/></svg>
                            <span>Invoices</span>
                        </button>
                    </li>
                    <li>
                        <button onClick={() => { setAdminView('settings'); setSelectedClientId(null); }} className={navItemClass('settings')}>
                            {/* Settings Icon */}
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.75 1.3a2 2 0 0 0 .73 2.73l.15.08a2 2 0 0 1 1 1.73v.44a2 2 0 0 1-1 1.73l-.15.08a2 2 0 0 0-.73 2.73l.75 1.3a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 1-1.73v.18a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.75-1.3a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>Settings (Permissions)</span>
                        </button>
                    </li>
                </ul>
                <p className="text-xs text-gray-500 mt-8 text-center">Admin ID: {user?.uid || 'N/A'}</p>
            </nav>

            {/* Main Content Area */}
            <section className="flex-1 p-4 md:p-8 pt-24 min-h-screen overflow-y-auto">
                <div className="max-w-6xl mx-auto">
                    {CurrentAdminView}
                </div>
            </section>
        </main>
    );
  };

  
  const LoginPage = () => {
      const [email, setEmail] = useState('');
      const [password, setPassword] = useState('');
      const [message, setMessage] = useState('');
      
      const handleMockLogin = (e, role) => {
          e.preventDefault();
          
          // Create a mock user object for the AdminPortal check
          // In a real app, this would be an actual user object from Firebase Auth
          const mockUser = { uid: 'mock-' + role + '-id-' + Math.random().toString(16).slice(2), email: email, isAnonymous: false };

          if (role === 'client' && email === 'client@esco.cpa' && password === 'password') {
              // Client login simulation
              setUser(mockUser); 
              setUserRole('client');
              setView('portal');
              setMessage({ type: 'success', text: 'Client Login Successful!' });
          } else if (role === 'admin' && email === 'admin@esco.cpa' && password === 'staffpass') {
              // Admin login simulation
              setUser(mockUser); 
              setUserRole('admin');
              setView('admin');
              setMessage({ type: 'success', text: 'Admin Login Successful!' });
          } else {
              setMessage({ type: 'error', text: 'Invalid credentials.' });
          }
      };

      const messageClass = message.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';

      return (
          <div className="min-h-screen pt-24 bg-gray-100 flex items-center justify-center">
              <div className="w-full max-w-md p-8 space-y-6 bg-white rounded-xl shadow-2xl border-t-4 border-secondary">
                  <h2 className="text-3xl font-bold text-center text-primary">Portal Access</h2>
                  <p className="text-center text-gray-500">Access your documents, invoices, and support center.</p>

                  <form className="space-y-4">
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                          <input 
                              type="email" 
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              required 
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-secondary focus:border-secondary transition duration-150"
                          />
                      </div>
                      <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                          <input 
                              type="password" 
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              required 
                              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-secondary focus:border-secondary transition duration-150"
                          />
                      </div>
                      
                      {/* Login Buttons */}
                      <div className="space-y-3">
                        <button type="submit" onClick={(e) => handleMockLogin(e, 'client')} className="w-full bg-primary text-white py-3 rounded-lg font-bold hover:bg-primary/90 transition duration-300 shadow-lg">
                            Client Log In
                        </button>
                         <button type="submit" onClick={(e) => handleMockLogin(e, 'admin')} className="w-full bg-gray-600 text-white py-3 rounded-lg font-bold hover:bg-gray-700 transition duration-300 shadow-lg">
                            Staff / Admin Log In
                        </button>
                      </div>

                      {message.text && (
                        <div className={`mt-4 p-3 rounded-lg text-center ${messageClass}`} role="alert">
                            {message.text}
                        </div>
                      )}
                      <div className="text-xs text-center text-red-500 pt-2 space-y-1">
                        <p>Client Mock: `client@esco.cpa` / `password`</p>
                        <p>Admin Mock: `admin@esco.cpa` / `staffpass`</p>
                      </div>
                  </form>
              </div>
          </div>
      );
  };


  // --- MAIN RENDER LOGIC ---

  if (!isAuthReady) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-primary">
            <svg className="animate-spin h-10 w-10 text-secondary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span className="ml-3 text-white">Loading Financial Data...</span>
        </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      <style>{`
        /* Global styles for smooth scrolling */
        html { scroll-behavior: smooth; }
        .section-padding { padding-top: 100px; margin-top: -100px; }
      `}</style>

      <Navbar onSignOut={handleSignOut} />
      <MobileMenu onSignOut={handleSignOut} />

      {view === 'home' && <MarketingPage />}
      {view === 'login' && <LoginPage />}
      {view === 'portal' && <ClientPortal appointments={appointments} />}
      {view === 'admin' && <AdminPortal />}
      
      <Footer />
    </div>
  );
};

export default App;
