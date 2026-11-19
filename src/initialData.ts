import type { Project, Material, InventoryTransaction, User, SiteQuery, ContractorRecord, InternalTransferRecord, Vendor, MarketPriceBenchmark, ProjectRequirement, VendorQuotation } from './types';

export const INITIAL_USERS: User[] = [
  {
    id: 'admin-1',
    name: 'Admin',
    email: 'admin@vyasgroup.com',
    password: 'admin',
    role: 'admin',
    title: 'Chief Operations Administrator',
    phone: '+91 98200 11223',
  },
  {
    id: 'sm-1',
    name: 'Site Manager 1',
    email: 'sitemanager1@vyasgroup.com',
    password: 'site123password',
    role: 'site_manager',
    title: 'Senior Site Engineer (Lotus Heights)',
    phone: '+91 98191 44332',
    assignedProjectId: 'proj-1',
  },
  {
    id: 'sm-2',
    name: 'Site Manager 2',
    email: 'sitemanager2@vyasgroup.com',
    password: 'site123password',
    role: 'site_manager',
    title: 'Project Lead (Grand Horizon)',
    phone: '+91 97230 55441',
    assignedProjectId: 'proj-2',
  },
  {
    id: 'sm-3',
    name: 'Site Manager 3',
    email: 'sitemanager3@vyasgroup.com',
    password: 'site123password',
    role: 'site_manager',
    title: 'Construction Engineer (Apex Plaza)',
    phone: '+91 96500 88776',
    assignedProjectId: 'proj-3',
  },
  {
    id: 'sm-4',
    name: 'Site Manager 4',
    email: 'sitemanager4@vyasgroup.com',
    password: 'site123password',
    role: 'site_manager',
    title: 'Site Manager (Civil)',
    phone: '+91 98765 12345',
  },
  {
    id: 'sm-pqr',
    name: 'Site Manager 5',
    email: 'ganeshnagargoje.syncai@gmail.com',
    password: 'site123password',
    role: 'site_manager',
    title: 'Site Manager (PQR Project)',
    phone: '+91 98234 56789',
    assignedProjectId: 'proj-pqr',
  },
];

export const INITIAL_PROJECTS: Project[] = [
  {
    id: 'proj-1',
    name: 'Lotus Heights (Tower A)',
    location: 'Sector 45, Greenfield Metro, Noida',
    manager: 'Site Manager 1',
    managerId: 'sm-1',
    managerEmail: 'sitemanager1@vyasgroup.com',
    managerPassword: 'site123password',
    startDate: '2026-03-01',
    status: 'ongoing',
  },
  {
    id: 'proj-2',
    name: 'Grand Horizon Residency',
    location: 'Hillview Enclave, Block C, Pune',
    manager: 'Site Manager 2',
    managerId: 'sm-2',
    managerEmail: 'sitemanager2@vyasgroup.com',
    managerPassword: 'site123password',
    startDate: '2026-05-15',
    status: 'ongoing',
  },
  {
    id: 'proj-3',
    name: 'Apex Commercial Plaza',
    location: 'Plot 102, CBD Belapur, Navi Mumbai',
    manager: 'Site Manager 3',
    managerId: 'sm-3',
    managerEmail: 'sitemanager3@vyasgroup.com',
    managerPassword: 'site123password',
    startDate: '2026-08-01',
    status: 'planning',
  },
  {
    id: 'proj-pqr',
    name: 'PQR Project',
    location: 'Plot 45, Tech Park Corridor, Pune',
    manager: 'Site Manager 5',
    managerId: 'sm-pqr',
    managerEmail: 'ganeshnagargoje.syncai@gmail.com',
    managerPassword: 'site123password',
    startDate: '2026-07-29',
    status: 'ongoing',
  }
];

export const INITIAL_QUERIES: SiteQuery[] = [
  {
    id: 'query-101',
    projectId: 'proj-1',
    projectName: 'Lotus Heights (Tower A)',
    materialId: 'mat-proj-1-1',
    materialName: 'TMT STEEL BARS',
    raisedByUserId: 'sm-1',
    raisedByName: 'Rajesh Sharma',
    subject: 'Delayed Consignment of 16mm TMT Steel Bars',
    category: 'Delivery Delay',
    urgency: 'High',
    description: 'The batch delivery of 16mm TMT steel bars from Tata Tiscon authorized vendor is 3 days overdue. Foundation pile bindings on Level 2 are currently waiting on this shipment.',
    photoProofUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=800&q=80',
    status: 'In Progress',
    createdAt: '2026-07-20 10:30 AM',
    responses: [
      {
        id: 'resp-1',
        authorUserId: 'admin-1',
        authorName: 'Vikramaditya Rao',
        authorRole: 'admin',
        message: 'Spoke directly with regional logistics desk. Transit truck cleared regional toll; dispatch is arriving at Noida site today by 3:30 PM.',
        createdAt: '2026-07-20 02:15 PM',
      },
      {
        id: 'resp-2',
        authorUserId: 'sm-1',
        authorName: 'Rajesh Sharma',
        authorRole: 'site_manager',
        message: 'Acknowledged. Will prepare offloading crew and weighbridge entry.',
        createdAt: '2026-07-20 02:40 PM',
      }
    ]
  },
  {
    id: 'query-102',
    projectId: 'proj-2',
    projectName: 'Grand Horizon Residency',
    materialId: 'mat-proj-2-37',
    materialName: 'AAC BLOCKS',
    raisedByUserId: 'sm-2',
    raisedByName: 'Ananya Goel',
    subject: 'AAC Block Compressive Strength & Edge Damage Issue',
    category: 'Quality Issue',
    urgency: 'Medium',
    description: 'Received truck consignment of Biltech AAC blocks showing corner chipping on ~12% of pieces during manual offloading. Need approval for third-party lab strength verification before mortar laying.',
    photoProofUrl: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=800&q=80',
    status: 'Open',
    createdAt: '2026-07-22 09:15 AM',
    responses: []
  }
];


// Definition template for the 52 required materials from the company purchase catalog
interface MaterialTemplate {
  materialCode: string;
  materialGroup: string;
  name: string;
  category: 'Structural' | 'Finishing' | 'Masonry' | 'Plumbing' | 'Electrical' | 'Others';
  unit: string;
  unitCost: number; // in Rs.
  minThreshold: number;
  stockProj1: number;
  stockProj2: number;
  stockProj3: number;
}

const MATERIAL_TEMPLATES: MaterialTemplate[] = [
  // 002: Steel & Rebar Materials
  { materialCode: '002', materialGroup: 'Steel & Structural Metals', name: 'TMT STEEL BARS', category: 'Structural', unit: 'Tons', unitCost: 58000, minThreshold: 10, stockProj1: 3.5, stockProj2: 8.2, stockProj3: 2.0 },
  { materialCode: '002', materialGroup: 'Steel & Structural Metals', name: 'MS STEEL (FABRICATION MATERIAL)', category: 'Structural', unit: 'Tons', unitCost: 64000, minThreshold: 5, stockProj1: 8.0, stockProj2: 4.5, stockProj3: 0 },

  // 001: All Cement Varieties share same code 001!
  { materialCode: '001', materialGroup: 'Cement & Binding Materials', name: 'CEMENT OPC', category: 'Structural', unit: 'Bags', unitCost: 430, minThreshold: 200, stockProj1: 80, stockProj2: 180, stockProj3: 50 },
  { materialCode: '001', materialGroup: 'Cement & Binding Materials', name: 'CEMENT PPC', category: 'Structural', unit: 'Bags', unitCost: 390, minThreshold: 200, stockProj1: 320, stockProj2: 220, stockProj3: 30 },
  { materialCode: '001', materialGroup: 'Cement & Binding Materials', name: 'WHITE CEMENT', category: 'Finishing', unit: 'Bags', unitCost: 880, minThreshold: 20, stockProj1: 35, stockProj2: 15, stockProj3: 0 },
  { materialCode: '001', materialGroup: 'Cement & Binding Materials', name: 'WHITE CEMENT (FINE)', category: 'Finishing', unit: 'Bags', unitCost: 950, minThreshold: 40, stockProj1: 90, stockProj2: 30, stockProj3: 0 },
  { materialCode: '001', materialGroup: 'Cement & Binding Materials', name: 'NON SHRINKAGE GROUT', category: 'Structural', unit: 'Bags', unitCost: 480, minThreshold: 25, stockProj1: 40, stockProj2: 15, stockProj3: 0 },

  // 003: Aggregates, Sands and Stones
  { materialCode: '003', materialGroup: 'Aggregates, Sand & Stone Crushes', name: 'CRUSH SAND', category: 'Structural', unit: 'Brass', unitCost: 5500, minThreshold: 8, stockProj1: 3, stockProj2: 6, stockProj3: 0 },
  { materialCode: '003', materialGroup: 'Aggregates, Sand & Stone Crushes', name: 'M SAND / PLASTER SAND', category: 'Structural', unit: 'Brass', unitCost: 6200, minThreshold: 8, stockProj1: 15, stockProj2: 5, stockProj3: 0 },
  { materialCode: '003', materialGroup: 'Aggregates, Sand & Stone Crushes', name: 'AGGREGATE 10 MM', category: 'Structural', unit: 'Brass', unitCost: 4800, minThreshold: 10, stockProj1: 14, stockProj2: 8, stockProj3: 0 },
  { materialCode: '003', materialGroup: 'Aggregates, Sand & Stone Crushes', name: 'AGGREGATE 20 MM', category: 'Structural', unit: 'Brass', unitCost: 4600, minThreshold: 10, stockProj1: 4, stockProj2: 9, stockProj3: 0 },

  // 005: Waterproofing & Chemical Compounds
  { materialCode: '005', materialGroup: 'Waterproofing & Construction Chemicals', name: '2K WATERPROOFING COMPOUND', category: 'Finishing', unit: 'Kits', unitCost: 2500, minThreshold: 15, stockProj1: 25, stockProj2: 12, stockProj3: 0 },
  { materialCode: '005', materialGroup: 'Waterproofing & Construction Chemicals', name: 'LATEX WATERPROOFING COMPOUND', category: 'Finishing', unit: 'Liters', unitCost: 190, minThreshold: 100, stockProj1: 150, stockProj2: 80, stockProj3: 0 },
  { materialCode: '005', materialGroup: 'Waterproofing & Construction Chemicals', name: 'SBR WATERPROOFING COMPOUND', category: 'Finishing', unit: 'Liters', unitCost: 230, minThreshold: 100, stockProj1: 120, stockProj2: 60, stockProj3: 0 },
  { materialCode: '005', materialGroup: 'Waterproofing & Construction Chemicals', name: 'HDPE SHEET', category: 'Finishing', unit: 'Rolls', unitCost: 3600, minThreshold: 6, stockProj1: 10, stockProj2: 4, stockProj3: 0 },
  { materialCode: '005', materialGroup: 'Waterproofing & Construction Chemicals', name: '50MM GSM CLOTH', category: 'Finishing', unit: 'Rolls', unitCost: 1900, minThreshold: 8, stockProj1: 12, stockProj2: 6, stockProj3: 0 },

  // 006: Tiles & Gypsum
  { materialCode: '006', materialGroup: 'Tiles, Gypsum & Tile Adhesives', name: 'TILES', category: 'Finishing', unit: 'Boxes', unitCost: 680, minThreshold: 100, stockProj1: 240, stockProj2: 80, stockProj3: 0 },
  { materialCode: '006', materialGroup: 'Tiles, Gypsum & Tile Adhesives', name: 'GYPSUM', category: 'Finishing', unit: 'Bags', unitCost: 360, minThreshold: 50, stockProj1: 120, stockProj2: 45, stockProj3: 0 },
  { materialCode: '006', materialGroup: 'Tiles, Gypsum & Tile Adhesives', name: 'TILE ADHESIVE', category: 'Finishing', unit: 'Bags', unitCost: 400, minThreshold: 80, stockProj1: 180, stockProj2: 60, stockProj3: 0 },

  // 004: Masonry & Blocks
  { materialCode: '004', materialGroup: 'Masonry Blocks & Bricks', name: 'SANLA', category: 'Masonry', unit: 'Bags', unitCost: 190, minThreshold: 60, stockProj1: 150, stockProj2: 50, stockProj3: 0 },
  { materialCode: '004', materialGroup: 'Masonry Blocks & Bricks', name: 'AAC BLOCKS', category: 'Masonry', unit: 'Pieces', unitCost: 68, minThreshold: 1000, stockProj1: 3500, stockProj2: 1200, stockProj3: 100 },
  { materialCode: '004', materialGroup: 'Masonry Blocks & Bricks', name: 'FLYASH BRICKS', category: 'Masonry', unit: 'Pieces', unitCost: 9, minThreshold: 5000, stockProj1: 15000, stockProj2: 4000, stockProj3: 0 },
  { materialCode: '004', materialGroup: 'Masonry Blocks & Bricks', name: 'BLOCK ADHESIVE', category: 'Masonry', unit: 'Bags', unitCost: 340, minThreshold: 100, stockProj1: 250, stockProj2: 80, stockProj3: 0 },

  // 011: Plumbing & Sanitaryware
  { materialCode: '011', materialGroup: 'Plumbing, Pipes & Sanitaryware', name: 'PLUMBING PIPES & FITTINGS', category: 'Plumbing', unit: 'Pieces', unitCost: 320, minThreshold: 80, stockProj1: 180, stockProj2: 70, stockProj3: 10 },
  { materialCode: '011', materialGroup: 'Plumbing, Pipes & Sanitaryware', name: 'CP FITTINGS', category: 'Plumbing', unit: 'Pieces', unitCost: 1250, minThreshold: 60, stockProj1: 120, stockProj2: 45, stockProj3: 0 },
  { materialCode: '011', materialGroup: 'Plumbing, Pipes & Sanitaryware', name: 'SANITARY FITTINGS', category: 'Plumbing', unit: 'Pieces', unitCost: 4000, minThreshold: 30, stockProj1: 75, stockProj2: 25, stockProj3: 0 },
  { materialCode: '011', materialGroup: 'Plumbing, Pipes & Sanitaryware', name: 'KITCHEN SINK', category: 'Plumbing', unit: 'Pieces', unitCost: 2900, minThreshold: 15, stockProj1: 25, stockProj2: 10, stockProj3: 0 },
  { materialCode: '011', materialGroup: 'Plumbing, Pipes & Sanitaryware', name: 'PUMPS', category: 'Plumbing', unit: 'Pieces', unitCost: 9000, minThreshold: 3, stockProj1: 6, stockProj2: 2, stockProj3: 1 },

  // 010: Electrical Cables & Switchgears
  { materialCode: '010', materialGroup: 'Electrical Cables & Switchgears', name: 'ELECTRICAL WIRES', category: 'Electrical', unit: 'Coils', unitCost: 1500, minThreshold: 40, stockProj1: 15, stockProj2: 35, stockProj3: 0 },
  { materialCode: '010', materialGroup: 'Electrical Cables & Switchgears', name: 'ELECTRICAL SWITCHES', category: 'Electrical', unit: 'Pieces', unitCost: 90, minThreshold: 200, stockProj1: 450, stockProj2: 150, stockProj3: 0 },
  { materialCode: '010', materialGroup: 'Electrical Cables & Switchgears', name: 'ELECTRICAL SWITCHGEARS', category: 'Electrical', unit: 'Pieces', unitCost: 480, minThreshold: 30, stockProj1: 65, stockProj2: 25, stockProj3: 0 },
  { materialCode: '010', materialGroup: 'Electrical Cables & Switchgears', name: 'ELECTRICAL DISTRIBUTION BOXES', category: 'Electrical', unit: 'Pieces', unitCost: 1250, minThreshold: 8, stockProj1: 15, stockProj2: 6, stockProj3: 0 },
  { materialCode: '010', materialGroup: 'Electrical Cables & Switchgears', name: 'ELECTRICAL CONDUIT PIPES & FITTINGS', category: 'Electrical', unit: 'Pieces', unitCost: 50, minThreshold: 300, stockProj1: 600, stockProj2: 250, stockProj3: 0 },

  // 007: Flooring, Stone & Marbles
  { materialCode: '007', materialGroup: 'Flooring, Stone & Marble Works', name: 'GRANITE', category: 'Finishing', unit: 'Sq Ft', unitCost: 190, minThreshold: 400, stockProj1: 850, stockProj2: 300, stockProj3: 0 },
  { materialCode: '007', materialGroup: 'Flooring, Stone & Marble Works', name: 'MARBLE', category: 'Finishing', unit: 'Sq Ft', unitCost: 260, minThreshold: 300, stockProj1: 500, stockProj2: 250, stockProj3: 0 },
  { materialCode: '007', materialGroup: 'Flooring, Stone & Marble Works', name: 'KADAPPA', category: 'Finishing', unit: 'Sq Ft', unitCost: 80, minThreshold: 200, stockProj1: 400, stockProj2: 150, stockProj3: 0 },
  { materialCode: '007', materialGroup: 'Flooring, Stone & Marble Works', name: 'KOTA STONE', category: 'Finishing', unit: 'Sq Ft', unitCost: 70, minThreshold: 500, stockProj1: 1200, stockProj2: 400, stockProj3: 0 },
  { materialCode: '007', materialGroup: 'Flooring, Stone & Marble Works', name: 'WOODEN FLOORING', category: 'Finishing', unit: 'Sq Ft', unitCost: 150, minThreshold: 500, stockProj1: 800, stockProj2: 200, stockProj3: 0 },

  // 008: Doors & Hardware
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOORS', category: 'Finishing', unit: 'Pieces', unitCost: 4800, minThreshold: 20, stockProj1: 45, stockProj2: 15, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOOR LOCKS', category: 'Finishing', unit: 'Pieces', unitCost: 880, minThreshold: 30, stockProj1: 60, stockProj2: 20, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOOR HINGES', category: 'Finishing', unit: 'Pieces', unitCost: 70, minThreshold: 120, stockProj1: 250, stockProj2: 80, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOOR HANDLE', category: 'Finishing', unit: 'Pieces', unitCost: 240, minThreshold: 60, stockProj1: 110, stockProj2: 40, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOOR TOWER BOLT', category: 'Finishing', unit: 'Pieces', unitCost: 100, minThreshold: 80, stockProj1: 140, stockProj2: 50, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DOOR STOPPER', category: 'Finishing', unit: 'Pieces', unitCost: 85, minThreshold: 80, stockProj1: 130, stockProj2: 45, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'DIGITAL LOCKS', category: 'Finishing', unit: 'Pieces', unitCost: 8800, minThreshold: 5, stockProj1: 12, stockProj2: 3, stockProj3: 0 },
  { materialCode: '008', materialGroup: 'Doors, Locks & Hardware', name: 'GI FRENCH DOORS', category: 'Finishing', unit: 'Pieces', unitCost: 13000, minThreshold: 8, stockProj1: 15, stockProj2: 5, stockProj3: 0 },

  // 009: Windows & Exterior
  { materialCode: '009', materialGroup: 'Windows & Facade Systems', name: 'ALUMINIUM WINDOWS', category: 'Finishing', unit: 'Pieces', unitCost: 3800, minThreshold: 25, stockProj1: 60, stockProj2: 18, stockProj3: 0 },
  { materialCode: '009', materialGroup: 'Windows & Facade Systems', name: 'ACP SHEETS', category: 'Finishing', unit: 'Pieces', unitCost: 1500, minThreshold: 30, stockProj1: 80, stockProj2: 20, stockProj3: 0 },
  { materialCode: '009', materialGroup: 'Windows & Facade Systems', name: 'SHOP SHUTTERS', category: 'Others', unit: 'Pieces', unitCost: 16000, minThreshold: 4, stockProj1: 10, stockProj2: 2, stockProj3: 0 },

  // 012: Paints & Coatings
  { materialCode: '012', materialGroup: 'Paints & Wall Finishes', name: 'PAINTING MATERIALS', category: 'Finishing', unit: 'Liters', unitCost: 220, minThreshold: 200, stockProj1: 450, stockProj2: 150, stockProj3: 0 },
  { materialCode: '012', materialGroup: 'Paints & Wall Finishes', name: 'TEXTURE PAINT', category: 'Finishing', unit: 'Bags', unitCost: 680, minThreshold: 50, stockProj1: 120, stockProj2: 40, stockProj3: 0 },

  // 013: Signage & Safety
  { materialCode: '013', materialGroup: 'Site Signage & Safety Equipment', name: 'SIGNAGES FOR PROJECTS', category: 'Others', unit: 'Pieces', unitCost: 800, minThreshold: 15, stockProj1: 30, stockProj2: 10, stockProj3: 2 },
];

// Generate materials for all projects dynamically
export const INITIAL_MATERIALS: Material[] = [];

INITIAL_PROJECTS.forEach((proj, pIdx) => {
  MATERIAL_TEMPLATES.forEach((temp, idx) => {
    let stock = 0;
    if (proj.id === 'proj-1') stock = temp.stockProj1;
    else if (proj.id === 'proj-2') stock = temp.stockProj2;
    else if (proj.id === 'proj-3') stock = temp.stockProj3;
    else if (proj.id === 'proj-pqr') stock = temp.stockProj1 || 20;

    // Determine GST vs URD
    const isUrd = ['003', '004'].includes(temp.materialCode) && (temp.name.includes('SAND') || temp.name.includes('SANLA') || temp.name.includes('BRICKS') || temp.name.includes('AGGREGATE'));
    const billType: 'GST' | 'URD' = isUrd ? 'URD' : 'GST';
    const billNumber = isUrd 
      ? `URD-VCH-${String(pIdx * 100 + idx + 1).padStart(4, '0')}`
      : `GST-2026/${String(pIdx * 100 + idx + 1).padStart(4, '0')}`;
    
    const gstRate = isUrd ? 0 : (temp.name.includes('LOCKS') || temp.name.includes('FITTINGS') ? 18 : 18);
    const baseAmt = temp.unitCost * stock;
    const gstAmt = isUrd ? 0 : Math.round(baseAmt * (gstRate / 100));
    const totalAmt = baseAmt + gstAmt;

    const vendorName = isUrd
      ? 'Local Quarry & River Mining Syndicate'
      : (temp.name.includes('STEEL') ? 'Tata Tiscon Authorized Distributor' : (temp.name.includes('CEMENT') ? 'UltraTech Cement Distributors' : 'Apex Buildware & Hardware Depot'));

    const vendorGstin = isUrd ? undefined : `27AABC${String(1000 + idx)}Q1Z${(idx % 9) + 1}`;

    INITIAL_MATERIALS.push({
      id: `mat-${proj.id}-${idx + 1}`,
      projectId: proj.id,
      name: temp.name,
      category: temp.category,
      unit: temp.unit,
      currentStock: stock,
      minThreshold: temp.minThreshold,
      unitCost: temp.unitCost,
      totalPrice: totalAmt,
      baseAmount: baseAmt,
      gstRate: gstRate,
      gstAmount: gstAmt,
      billType: billType,
      billNumber: billNumber,
      vendorName: vendorName,
      vendorGstin: vendorGstin,
      materialCode: temp.materialCode,
      materialGroup: temp.materialGroup,
    });
  });
});

// Generate some nice historical transactions
export const INITIAL_TRANSACTIONS: InventoryTransaction[] = [
  // Lotus Heights (proj-1)
  {
    id: 'tx-101',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-1', // TMT STEEL BARS
    type: 'addition',
    quantity: 10.0,
    rate: 58000,
    baseAmount: 580000,
    gstRate: 18,
    gstAmount: 104400,
    totalPrice: 684400,
    billType: 'GST',
    billNumber: 'GST-2026/0101',
    vendorName: 'Tata Tiscon Authorized Distributor',
    vendorGstin: '27AAACT2941Q1ZX',
    date: '2026-07-15',
    notes: 'Inward delivery from Tata Tiscon authorized dealer with Tax Invoice',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-102',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-1',
    type: 'consumption',
    quantity: 4.5,
    date: '2026-07-16',
    notes: 'Slab reinforcement and pile foundation bindings',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-103',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-3', // CEMENT OPC
    type: 'addition',
    quantity: 200,
    rate: 430,
    baseAmount: 86000,
    gstRate: 18,
    gstAmount: 15480,
    totalPrice: 101480,
    billType: 'GST',
    billNumber: 'GST-2026/0103',
    vendorName: 'UltraTech Cement Distributors',
    vendorGstin: '27AABCU9021K1ZM',
    date: '2026-07-14',
    notes: 'Inward supply of UltraTech OPC grade cement with GST Invoice',
    operator: 'Suresh Patil (Storekeeper)',
  },
  {
    id: 'tx-104',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-3',
    type: 'consumption',
    quantity: 80,
    date: '2026-07-17',
    notes: 'Plinth concrete casting and beam filling',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-105',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-8', // CRUSH SAND
    type: 'addition',
    quantity: 10,
    rate: 5500,
    baseAmount: 55000,
    gstRate: 0,
    gstAmount: 0,
    totalPrice: 55000,
    billType: 'URD',
    billNumber: 'URD-VCH-0105',
    vendorName: 'Local Quarry & River Mining Syndicate',
    date: '2026-07-12',
    notes: 'Delivered from stone crushing quarry (URD Unregistered Vendor Voucher)',
    operator: 'Suresh Patil (Storekeeper)',
  },
  {
    id: 'tx-106',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-8',
    type: 'consumption',
    quantity: 4,
    date: '2026-07-18',
    notes: 'Mortar mixing for outer brickwork partition',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-107',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-20', // AAC BLOCKS
    type: 'addition',
    quantity: 1500,
    rate: 68,
    baseAmount: 102000,
    gstRate: 12,
    gstAmount: 12240,
    totalPrice: 114240,
    billType: 'GST',
    billNumber: 'GST-2026/0120',
    vendorName: 'Biltech Building Elements Ltd',
    vendorGstin: '27AABCB8841P1ZQ',
    date: '2026-07-11',
    notes: 'Inward dispatch of Biltech lightweight AAC blocks',
    operator: 'Suresh Patil (Storekeeper)',
  },
  {
    id: 'tx-108',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-20',
    type: 'consumption',
    quantity: 500,
    date: '2026-07-18',
    notes: 'Masonry work on level 1 partition walls',
    operator: 'Rajesh Sharma',
  },

  // Grand Horizon (proj-2)
  {
    id: 'tx-201',
    projectId: 'proj-2',
    materialId: 'mat-proj-2-1', // TMT STEEL BARS
    type: 'addition',
    quantity: 5.0,
    rate: 58000,
    baseAmount: 290000,
    gstRate: 18,
    gstAmount: 52200,
    totalPrice: 342200,
    billType: 'GST',
    billNumber: 'GST-2026/0201',
    vendorName: 'Tata Tiscon Authorized Distributor',
    vendorGstin: '27AAACT2941Q1ZX',
    date: '2026-07-14',
    notes: 'Site delivery for structural columns reinforcement',
    operator: 'Ananya Goel',
  },
  {
    id: 'tx-202',
    projectId: 'proj-2',
    materialId: 'mat-proj-2-3', // CEMENT OPC
    type: 'addition',
    quantity: 100,
    rate: 430,
    baseAmount: 43000,
    gstRate: 18,
    gstAmount: 7740,
    totalPrice: 50740,
    billType: 'GST',
    billNumber: 'GST-2026/0203',
    vendorName: 'Ambuja Cement Traders',
    vendorGstin: '27AABCA3310J1ZN',
    date: '2026-07-16',
    notes: 'Received OPC cement bags from Ambuja dealer',
    operator: 'Karan Mehra (Supervisor)',
  },
  {
    id: 'tx-203',
    projectId: 'proj-2',
    materialId: 'mat-proj-2-3',
    type: 'consumption',
    quantity: 40,
    date: '2026-07-18',
    notes: 'Slab touchups and partition masonry mortar',
    operator: 'Ananya Goel',
  },

  // Recent transactions (Today & Last 7 Days)
  {
    id: 'tx-301',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-3', // CEMENT OPC
    type: 'addition',
    quantity: 150,
    rate: 430,
    baseAmount: 64500,
    gstRate: 18,
    gstAmount: 11610,
    totalPrice: 76110,
    billType: 'GST',
    billNumber: 'GST-2026/0301',
    vendorName: 'UltraTech Cement Distributors',
    vendorGstin: '27AABCU9021K1ZM',
    date: '2026-07-30',
    notes: 'Fresh consignment arrival of UltraTech Cement with Tax Invoice',
    operator: 'Suresh Patil (Storekeeper)',
  },
  {
    id: 'tx-302',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-1', // TMT STEEL BARS
    type: 'consumption',
    quantity: 2.0,
    date: '2026-07-30',
    notes: 'Level 3 column beam bindings',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-303',
    projectId: 'proj-2',
    materialId: 'mat-proj-2-20', // AAC BLOCKS
    type: 'addition',
    quantity: 800,
    rate: 68,
    baseAmount: 54400,
    gstRate: 12,
    gstAmount: 6528,
    totalPrice: 60928,
    billType: 'GST',
    billNumber: 'GST-2026/0303',
    vendorName: 'Biltech Building Elements Ltd',
    vendorGstin: '27AABCB8841P1ZQ',
    date: '2026-07-29',
    notes: 'Inward delivery of AAC blocks for partition walls',
    operator: 'Ananya Goel',
  },
  {
    id: 'tx-304',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-8', // CRUSH SAND
    type: 'consumption',
    quantity: 3.5,
    date: '2026-07-28',
    notes: 'External plastering mortar preparation',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-305',
    projectId: 'proj-pqr',
    materialId: 'mat-proj-pqr-1', // TMT STEEL BARS
    type: 'addition',
    quantity: 12.0,
    rate: 58000,
    baseAmount: 696000,
    gstRate: 18,
    gstAmount: 125280,
    totalPrice: 821280,
    billType: 'GST',
    billNumber: 'GST-2026/0305',
    vendorName: 'Tata Tiscon Authorized Distributor',
    vendorGstin: '27AAACT2941Q1ZX',
    date: '2026-07-27',
    notes: 'Initial steel stock arrival for PQR site foundation (GST Tax Invoice)',
    operator: 'Pranav Kulkarni',
  },

  // Monthly & Quarterly Historical Records (June & May 2026)
  {
    id: 'tx-401',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-21', // FLYASH BRICKS
    type: 'addition',
    quantity: 5000,
    rate: 9,
    baseAmount: 45000,
    gstRate: 0,
    gstAmount: 0,
    totalPrice: 45000,
    billType: 'URD',
    billNumber: 'URD-VCH-0401',
    vendorName: 'Rural Clay & Flyash Brick Kilns',
    date: '2026-06-20',
    notes: 'Bulk purchase of flyash bricks for boundary wall (URD Cash Voucher)',
    operator: 'Suresh Patil (Storekeeper)',
  },
  {
    id: 'tx-402',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-21',
    type: 'consumption',
    quantity: 1800,
    date: '2026-06-24',
    notes: 'Boundary wall construction & septic tank casing',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-403',
    projectId: 'proj-2',
    materialId: 'mat-proj-2-28', // ELECTRICAL CONDUIT PIPES
    type: 'addition',
    quantity: 300,
    rate: 50,
    baseAmount: 15000,
    gstRate: 18,
    gstAmount: 2700,
    totalPrice: 17700,
    billType: 'GST',
    billNumber: 'GST-2026/0403',
    vendorName: 'Polycab Electricals & Conduits Ltd',
    vendorGstin: '27AABCP4410K1ZX',
    date: '2026-05-18',
    notes: 'Internal electrical rough-in conduit pipes inward delivery with GST Invoice',
    operator: 'Ananya Goel',
  },

  // Quarterly & Yearly Historical Records (Q1 2026 & 2025)
  {
    id: 'tx-501',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-1', // TMT STEEL BARS
    type: 'addition',
    quantity: 25.0,
    rate: 58000,
    baseAmount: 1450000,
    gstRate: 18,
    gstAmount: 261000,
    totalPrice: 1711000,
    billType: 'GST',
    billNumber: 'GST-2026/0501',
    vendorName: 'Tata Tiscon Authorized Distributor',
    vendorGstin: '27AAACT2941Q1ZX',
    date: '2026-02-10',
    notes: 'Foundation & piling steel stock procurement (Q1 GST Tax Invoice)',
    operator: 'Rajesh Sharma',
  },
  {
    id: 'tx-601',
    projectId: 'proj-1',
    materialId: 'mat-proj-1-3', // CEMENT OPC
    type: 'addition',
    quantity: 500,
    rate: 430,
    baseAmount: 215000,
    gstRate: 18,
    gstAmount: 38700,
    totalPrice: 253700,
    billType: 'GST',
    billNumber: 'GST-2025/0601',
    vendorName: 'UltraTech Cement Distributors',
    vendorGstin: '27AABCU9021K1ZM',
    date: '2025-11-05',
    notes: 'Initial excavation & mudmat site preparation stock (2025 GST Bill)',
    operator: 'Rajesh Sharma',
  }
];

export const INITIAL_CONTRACTORS: ContractorRecord[] = [
  {
    id: 'contractor-1',
    firmName: 'Apex Structural Concrete Ltd',
    category: 'Civil & Concrete',
    projectId: 'proj-1',
    projectName: 'Lotus Heights (Tower A)',
    contactPerson: 'Sunil Deshmukh',
    phone: '+91 98210 55432',
    email: 'billing@apexconcrete.com',
    totalEstimatedBilling: 45000000, // 4.5 Cr
    pastBilling: 28000000, // 2.8 Cr
    currentBilling: 4500000, // 45 Lakhs
    currentBillingStatus: 'Approved',
    statusReason: 'Verified by Lead Structural Engineer after cube test reports clearance',
    pastBills: [
      {
        id: 'bill-101',
        billNumber: 'RA-BILL-01',
        date: '2026-04-10',
        amount: 10000000,
        status: 'Paid',
        notes: 'Foundation raft concreting RA Bill #1',
      },
      {
        id: 'bill-102',
        billNumber: 'RA-BILL-02',
        date: '2026-05-18',
        amount: 10000000,
        status: 'Paid',
        notes: 'Plinth beam & podium slab concreting',
      },
      {
        id: 'bill-103',
        billNumber: 'RA-BILL-03',
        date: '2026-06-25',
        amount: 8000000,
        status: 'Paid',
        notes: 'Level 1 & Level 2 columns concreting',
      },
    ],
    createdAt: '2026-03-05',
  },
  {
    id: 'contractor-2',
    firmName: 'BrightVolt Electrical Infra',
    category: 'Electrical Works',
    projectId: 'proj-2',
    projectName: 'Grand Horizon Residency',
    contactPerson: 'Manoj Tripathy',
    phone: '+91 97110 88990',
    email: 'manoj@brightvolt.co.in',
    totalEstimatedBilling: 18000000, // 1.8 Cr
    pastBilling: 9000000, // 90 Lakhs
    currentBilling: 2500000, // 25 Lakhs
    currentBillingStatus: 'Verified',
    statusReason: 'Under final inspection for distribution board grounding check',
    pastBills: [
      {
        id: 'bill-201',
        billNumber: 'BV-RA-01',
        date: '2026-05-02',
        amount: 5000000,
        status: 'Paid',
        notes: 'Main HT transformer installation & cable trenching',
      },
      {
        id: 'bill-202',
        billNumber: 'BV-RA-02',
        date: '2026-06-15',
        amount: 4000000,
        status: 'Paid',
        notes: 'Basement & podium ceiling conduit layout work',
      },
    ],
    createdAt: '2026-04-01',
  },
  {
    id: 'contractor-3',
    firmName: 'FlowTech Plumbing & Sanitation',
    category: 'Plumbing & Sanitation',
    projectId: 'proj-pqr',
    projectName: 'PQR Project',
    contactPerson: 'Arvind Mehta',
    phone: '+91 99880 12345',
    email: 'arvind@flowtech.in',
    totalEstimatedBilling: 9500000, // 95 Lakhs
    pastBilling: 4000000, // 40 Lakhs
    currentBilling: 1500000, // 15 Lakhs
    currentBillingStatus: 'Submitted',
    statusReason: 'Submitted by site supervisor on 28th July',
    pastBills: [
      {
        id: 'bill-301',
        billNumber: 'FTP-BILL-01',
        date: '2026-06-01',
        amount: 4000000,
        status: 'Paid',
        notes: 'Underground drainage & stormwater line laying',
      },
    ],
    createdAt: '2026-05-10',
  },
  {
    id: 'contractor-4',
    firmName: 'Mahavir Steel & Heavy Structures',
    category: 'Steel & Structural',
    projectId: 'proj-1',
    projectName: 'Lotus Heights (Tower A)',
    contactPerson: 'Harish Jain',
    phone: '+91 98112 33445',
    email: 'harish@mahavirsteel.com',
    totalEstimatedBilling: 32000000, // 3.2 Cr
    pastBilling: 21000000, // 2.1 Cr
    currentBilling: 3000000, // 30 Lakhs
    currentBillingStatus: 'Under Audit',
    statusReason: 'Audit team cross-verifying steel weight bridge slip records',
    pastBills: [
      {
        id: 'bill-401',
        billNumber: 'MS-RA-01',
        date: '2026-03-20',
        amount: 11000000,
        status: 'Paid',
        notes: 'Heavy structural steel columns fabrication',
      },
      {
        id: 'bill-402',
        billNumber: 'MS-RA-02',
        date: '2026-05-10',
        amount: 10000000,
        status: 'Paid',
        notes: 'Podium truss erection and high tensile bolting',
      },
    ],
    createdAt: '2026-03-01',
  },
  {
    id: 'contractor-5',
    firmName: 'Royale Interior & Gypsum Finishes',
    category: 'Interior & Finishing',
    projectId: 'proj-3',
    projectName: 'Apex Commercial Plaza',
    contactPerson: 'Sanjay Dutt',
    phone: '+91 97654 32109',
    email: 'sanjay@royaleinteriors.com',
    totalEstimatedBilling: 14000000, // 1.4 Cr
    pastBilling: 5000000, // 50 Lakhs
    currentBilling: 2000000, // 20 Lakhs
    currentBillingStatus: 'Payment Processing',
    statusReason: 'Finance department approved cheque processing',
    pastBills: [
      {
        id: 'bill-501',
        billNumber: 'RI-BILL-01',
        date: '2026-06-12',
        amount: 5000000,
        status: 'Paid',
        notes: 'Commercial lobby gypsum ceiling framework',
      },
    ],
    createdAt: '2026-05-01',
  },
];

export const INITIAL_TRANSFERS: InternalTransferRecord[] = [
  {
    id: 'itrans-1',
    materialName: 'OPC 53 Grade Cement Bags',
    category: 'Cement & Binding',
    outwardProjectId: 'proj-1',
    outwardProjectName: 'Lotus Heights (Tower A)',
    inwardProjectId: 'proj-2',
    inwardProjectName: 'Grand Horizon Residency',
    quantity: 150,
    unit: 'Bags',
    rate: 380,
    amount: 57000, // 150 * 380
    status: 'Received & Verified',
    transferDate: '2026-07-28',
    vehicleNumber: 'MH-12-PQ-4589',
    driverName: 'Suresh Patil',
    notes: 'Urgent transfer for 4th floor slab casting requirement',
    photoFileName: 'cement_delivery_challan.jpg',
    photoUrl: 'https://images.unsplash.com/photo-1589939705384-5185137a7f0f?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-07-28',
  },
  {
    id: 'itrans-2',
    materialName: '16mm Fe550 TMT Rebar Steel',
    category: 'Steel & Metals',
    outwardProjectId: 'proj-2',
    outwardProjectName: 'Grand Horizon Residency',
    inwardProjectId: 'proj-pqr',
    inwardProjectName: 'PQR Project',
    quantity: 5,
    unit: 'Ton',
    rate: 62000,
    amount: 310000, // 5 * 62000
    status: 'In Transit',
    transferDate: '2026-07-31',
    vehicleNumber: 'MH-14-CW-9012',
    driverName: 'Ramesh Pawar',
    notes: 'Inter-site steel load shift via flatbed trailer',
    photoFileName: 'steel_trailer_loading.jpg',
    photoUrl: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-07-31',
  },
  {
    id: 'itrans-3',
    materialName: 'Crushed Coarse Aggregate 20mm',
    category: 'Aggregates & Sand',
    outwardProjectId: 'proj-3',
    outwardProjectName: 'Apex Commercial Plaza',
    inwardProjectId: 'proj-1',
    inwardProjectName: 'Lotus Heights (Tower A)',
    quantity: 25,
    unit: 'Brass / Ton',
    rate: 2400,
    amount: 60000, // 25 * 2400
    status: 'Dispatched',
    transferDate: '2026-08-01',
    vehicleNumber: 'MH-04-EK-1122',
    driverName: 'Dilip Sawant',
    notes: 'Dump truck dispatch from Apex Plaza excess stock pile',
    photoFileName: 'aggregate_dump_truck.jpg',
    photoUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b3?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-08-01',
  },
  {
    id: 'itrans-4',
    materialName: 'AAC Concrete Blocks (600x200x150mm)',
    category: 'Masonry & Bricks',
    outwardProjectId: 'proj-pqr',
    outwardProjectName: 'PQR Project',
    inwardProjectId: 'proj-3',
    inwardProjectName: 'Apex Commercial Plaza',
    quantity: 800,
    unit: 'Nos.',
    rate: 65,
    amount: 52000, // 800 * 65
    status: 'Rejected / Issue',
    transferDate: '2026-07-25',
    vehicleNumber: 'MH-12-ST-3344',
    driverName: 'Mahesh Jadhav',
    notes: 'Partial edge chipping during transit transit unloading; 120 blocks rejected at gate',
    photoFileName: 'chipped_aac_blocks.jpg',
    photoUrl: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?auto=format&fit=crop&w=800&q=80',
    createdAt: '2026-07-25',
  },
];

// -------------------------------------------------------------
// Approved Vendors Registry (Mapped by Material Code)
// -------------------------------------------------------------
export const INITIAL_VENDORS: Vendor[] = [
  {
    id: 'ven-1',
    name: 'UltraTech Building Supplies Ltd',
    contactPerson: 'Rameshwar Kulkarni',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98220 11990',
    address: 'Plot 42, MIDC Bhosari, Pune - 411026',
    gstin: '27AAACU1234F1Z8',
    rating: 4.9,
    suppliedMaterialCodes: ['001', '003', '004'],
    standardCreditPeriod: '45 Days',
    avgLeadDays: 2,
    status: 'Preferred',
  },
  {
    id: 'ven-2',
    name: 'Tata Steel & Rebars Direct',
    contactPerson: 'Siddharth Sen',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98300 44551',
    address: 'Industrial Area 14, Pimpri Logistics Hub, Pune',
    gstin: '27AAACT9876G1ZA',
    rating: 4.8,
    suppliedMaterialCodes: ['002'],
    standardCreditPeriod: '30 Days',
    avgLeadDays: 3,
    status: 'Preferred',
  },
  {
    id: 'ven-3',
    name: 'Jindal Panther Infrastructure',
    contactPerson: 'Amitava Banerjee',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98110 33221',
    address: 'Expressway Logistics Hub, Sector 63, Noida',
    gstin: '07AAACJ5544H1Z2',
    rating: 4.7,
    suppliedMaterialCodes: ['002'],
    standardCreditPeriod: '45 Days',
    avgLeadDays: 2,
    status: 'Approved',
  },
  {
    id: 'ven-4',
    name: 'ACC Cement & Aggregates Mart',
    contactPerson: 'Mahendra Joshi',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98900 77889',
    address: 'Wakad Bypass Yard, Pune - 411057',
    gstin: '27AAACA4433E1ZX',
    rating: 4.6,
    suppliedMaterialCodes: ['001', '003'],
    standardCreditPeriod: '30 Days',
    avgLeadDays: 1,
    status: 'Approved',
  },
  {
    id: 'ven-5',
    name: 'Ambuja Cements Regional Depot',
    contactPerson: 'Vijay Singhania',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98200 99882',
    address: 'Transport Nagar, Sector 62, Noida',
    gstin: '07AAACA2211D1ZQ',
    rating: 4.7,
    suppliedMaterialCodes: ['001'],
    standardCreditPeriod: '15 Days',
    avgLeadDays: 2,
    status: 'Approved',
  },
  {
    id: 'ven-6',
    name: 'Apex Sand & River Stone Crushers',
    contactPerson: 'Ganesh Shinde',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98500 66332',
    address: 'Pawana Riverbank Quarry Yard, Pune',
    gstin: '27AAACA3322C1ZW',
    rating: 4.5,
    suppliedMaterialCodes: ['003'],
    standardCreditPeriod: '15 Days',
    avgLeadDays: 1,
    status: 'Approved',
  },
  {
    id: 'ven-7',
    name: 'Birla Aerocon & EcoBlocks',
    contactPerson: 'Sunil Nair',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98100 22334',
    address: 'Chakan Industrial Phase 2, Pune',
    gstin: '27AAACB1100B1ZM',
    rating: 4.8,
    suppliedMaterialCodes: ['004'],
    standardCreditPeriod: '30 Days',
    avgLeadDays: 3,
    status: 'Approved',
  },
  {
    id: 'ven-8',
    name: 'Dr. Fixit Waterproofing & Pidilite Solutions',
    contactPerson: 'Anand Deshmukh',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98450 77112',
    address: 'Senapati Bapat Road, Pune',
    gstin: '27AAACP4499P1ZK',
    rating: 4.9,
    suppliedMaterialCodes: ['005'],
    standardCreditPeriod: '45 Days',
    avgLeadDays: 2,
    status: 'Preferred',
  },
  {
    id: 'ven-9',
    name: 'Polycab & Havells Industrial Cables',
    contactPerson: 'Ketan Shah',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98210 55443',
    address: 'Lohar Chawl Wholesale Hub, Mumbai',
    gstin: '27AAACP6633E1ZN',
    rating: 4.8,
    suppliedMaterialCodes: ['010'],
    standardCreditPeriod: '30 Days',
    avgLeadDays: 2,
    status: 'Preferred',
  },
  {
    id: 'ven-10',
    name: 'Supreme Pipes & Sanitary Fittings',
    contactPerson: 'Hasmukh Patel',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98201 44332',
    address: 'Kalamboli Steel & Pipe Market, Navi Mumbai',
    gstin: '27AAACS8822K1ZT',
    rating: 4.7,
    suppliedMaterialCodes: ['011'],
    standardCreditPeriod: '30 Days',
    avgLeadDays: 2,
    status: 'Approved',
  },
  {
    id: 'ven-11',
    name: 'Asian Paints Regional Depot',
    contactPerson: 'Pradeep Verma',
    email: 'ganeshnagargoje1008@gmail.com',
    phone: '+91 98190 22110',
    address: 'Greater Noida Logistics Park, Noida',
    gstin: '07AAACA9988G1ZP',
    rating: 4.8,
    suppliedMaterialCodes: ['012'],
    standardCreditPeriod: '45 Days',
    avgLeadDays: 2,
    status: 'Preferred',
  },
];

// -------------------------------------------------------------
// Market Price Benchmarks
// -------------------------------------------------------------
export const INITIAL_MARKET_BENCHMARKS: MarketPriceBenchmark[] = [
  {
    materialCode: '001',
    materialName: 'Cement (OPC 53 Grade)',
    category: 'Structural',
    unit: 'Bags',
    currentMarketPrice: 385,
    minMarketPrice: 365,
    maxMarketPrice: 410,
    lastUpdated: '2026-09-23',
    source: 'National Construction Commodity Index / Pune Builders Association',
    trend: 'stable',
    weeklyChangePct: -0.5,
  },
  {
    materialCode: '002',
    materialName: 'TMT Steel Rebars (Fe550D)',
    category: 'Structural',
    unit: 'Tons',
    currentMarketPrice: 65000,
    minMarketPrice: 62000,
    maxMarketPrice: 68500,
    lastUpdated: '2026-09-23',
    source: 'Steel Authority & Secondary Rebar Index',
    trend: 'down',
    weeklyChangePct: -1.8,
  },
  {
    materialCode: '003',
    materialName: 'River Sand / M-Sand',
    category: 'Structural',
    unit: 'Brass',
    currentMarketPrice: 4800,
    minMarketPrice: 4500,
    maxMarketPrice: 5200,
    lastUpdated: '2026-09-22',
    source: 'State Quarry & Mining Association',
    trend: 'up',
    weeklyChangePct: 2.1,
  },
  {
    materialCode: '004',
    materialName: 'AAC Lightweight Blocks (600x200x150)',
    category: 'Masonry',
    unit: 'Pieces',
    currentMarketPrice: 65,
    minMarketPrice: 60,
    maxMarketPrice: 72,
    lastUpdated: '2026-09-21',
    source: 'Brick & Block Manufacturers Guild',
    trend: 'stable',
    weeklyChangePct: 0.0,
  },
  {
    materialCode: '005',
    materialName: 'SBR Latex Waterproofing Chemical',
    category: 'Finishing',
    unit: 'Liters',
    currentMarketPrice: 280,
    minMarketPrice: 260,
    maxMarketPrice: 310,
    lastUpdated: '2026-09-20',
    source: 'Construction Chemicals Consortium',
    trend: 'stable',
    weeklyChangePct: 0.4,
  },
  {
    materialCode: '006',
    materialName: 'Vitrified Floor Tiles (600x600mm)',
    category: 'Finishing',
    unit: 'Boxes',
    currentMarketPrice: 640,
    minMarketPrice: 590,
    maxMarketPrice: 710,
    lastUpdated: '2026-09-19',
    source: 'Morbi Ceramic Manufacturers Association',
    trend: 'stable',
    weeklyChangePct: -0.2,
  },
  {
    materialCode: '010',
    materialName: 'Copper Armoured Cable 4-Core 16sqmm',
    category: 'Electrical',
    unit: 'Pieces',
    currentMarketPrice: 380,
    minMarketPrice: 350,
    maxMarketPrice: 420,
    lastUpdated: '2026-09-22',
    source: 'Copper Exchange & Wire Manufacturers Index',
    trend: 'up',
    weeklyChangePct: 1.5,
  },
  {
    materialCode: '011',
    materialName: 'CPVC High Pressure Pipes 1-inch',
    category: 'Plumbing',
    unit: 'Pieces',
    currentMarketPrice: 420,
    minMarketPrice: 390,
    maxMarketPrice: 460,
    lastUpdated: '2026-09-20',
    source: 'Polymer & PVC Raw Material Tracker',
    trend: 'stable',
    weeklyChangePct: -0.8,
  },
  {
    materialCode: '012',
    materialName: 'Acrylic Exterior Weatherproof Emulsion',
    category: 'Finishing',
    unit: 'Liters',
    currentMarketPrice: 340,
    minMarketPrice: 310,
    maxMarketPrice: 375,
    lastUpdated: '2026-09-21',
    source: 'Paints & Coatings Industry Benchmark',
    trend: 'down',
    weeklyChangePct: -1.2,
  },
];

// -------------------------------------------------------------
// Project Requirements (PRs / Order Queries)
// -------------------------------------------------------------
// No sample RFQs are seeded: requirements are raised from the app (Raise New Order Query / PR).
export const INITIAL_PRS: ProjectRequirement[] = [];

// -------------------------------------------------------------
// Vendor Quotations: none are seeded. Only real quotations are compared:
// those submitted by vendors through their secure link, and those entered
// for local (non-registered) vendors via "Add Quote".
// -------------------------------------------------------------
export const INITIAL_QUOTES: VendorQuotation[] = [];
