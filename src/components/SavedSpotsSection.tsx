import { motion, AnimatePresence } from 'motion/react';
import { Heart, MapPin, Star, Search, SlidersHorizontal, Folder, Plus, X, Navigation, Trash2, Edit3, Clock, TrendingUp, Archive } from 'lucide-react';
import { useState, useMemo } from 'react';
import {
  getSavedSpots,
  getSortedSavedSpots,
  searchSavedSpots,
  removeSavedSpot,
  updateSpotNotes,
  getSavedSpotsStats,
  getCollections,
  getCollectionSpots,
  createCollection,
  addSpotToCollection,
  removeSpotFromCollection,
  type SavedSpot,
  type SpotType,
  type SavedCollection,
} from '../utils/savedSpots';
import { toast } from 'sonner@2.0.3';

interface SavedSpotsSectionProps {
  isDarkMode: boolean;
  onNavigateToSpot?: (spotId: string, spotType: SpotType) => void;
}

export function SavedSpotsSection({ isDarkMode, onNavigateToSpot }: SavedSpotsSectionProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name' | 'visits' | 'distance'>('recent');
  const [filterType, setFilterType] = useState<SpotType | 'all'>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedSpot, setSelectedSpot] = useState<SavedSpot | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [viewMode, setViewMode] = useState<'all' | 'collections'>('all');
  const [selectedCollection, setSelectedCollection] = useState<SavedCollection | null>(null);
  const [showNewCollection, setShowNewCollection] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');

  const springConfig = {
    type: "spring" as const,
    stiffness: 320,
    damping: 30,
    mass: 0.8,
  };

  // Get filtered and sorted spots
  const displayedSpots = useMemo(() => {
    let spots: SavedSpot[] = [];

    if (viewMode === 'collections' && selectedCollection) {
      spots = getCollectionSpots(selectedCollection.id);
    } else {
      spots = searchQuery ? searchSavedSpots(searchQuery) : getSortedSavedSpots(sortBy);
    }

    if (filterType !== 'all') {
      spots = spots.filter(spot => spot.type === filterType);
    }

    return spots;
  }, [searchQuery, sortBy, filterType, viewMode, selectedCollection]);

  const stats = getSavedSpotsStats();
  const collections = getCollections();

  const handleRemoveSpot = (spotId: string) => {
    removeSavedSpot(spotId);
    toast.success('Removed from saved spots');
    if (selectedSpot?.id === spotId) {
      setSelectedSpot(null);
    }
  };

  const handleSaveNotes = () => {
    if (selectedSpot) {
      updateSpotNotes(selectedSpot.id, notesText);
      setSelectedSpot({ ...selectedSpot, notes: notesText });
      setEditingNotes(false);
      toast.success('Notes saved');
    }
  };

  const handleNavigate = (spot: SavedSpot) => {
    if (onNavigateToSpot) {
      onNavigateToSpot(spot.id, spot.type);
    }
    toast.success('Opening navigation', {
      description: `Navigating to ${spot.name}`,
    });
  };

  const handleCreateCollection = () => {
    if (newCollectionName.trim()) {
      const icons = ['📍', '⭐', '💼', '🎉', '☕', '🍽️', '🛍️', '🎭', '💪', '🌟'];
      const colors = ['purple', 'blue', 'green', 'orange', 'pink', 'cyan'];
      
      createCollection(
        newCollectionName,
        undefined,
        icons[Math.floor(Math.random() * icons.length)],
        colors[Math.floor(Math.random() * colors.length)]
      );
      
      toast.success('Collection created');
      setNewCollectionName('');
      setShowNewCollection(false);
    }
  };

  const handleAddToCollection = (collectionId: string, spotId: string) => {
    addSpotToCollection(collectionId, spotId);
    toast.success('Added to collection');
  };

  const getTypeIcon = (type: SpotType) => {
    switch (type) {
      case 'parking':
        return '🅿️';
      case 'valet':
        return '🎩';
      case 'venue':
        return '🏢';
      case 'coffee':
        return '☕';
      case 'dining':
        return '🍽️';
      case 'shopping':
        return '🛍️';
      case 'nightlife':
        return '🌙';
      case 'entertainment':
        return '🎭';
      case 'fitness':
        return '💪';
      default:
        return '📍';
    }
  };

  const getTypeColor = (type: SpotType) => {
    switch (type) {
      case 'parking':
        return 'from-cyan-500/40 to-blue-500/40';
      case 'valet':
        return 'from-purple-500/40 to-fuchsia-500/40';
      case 'venue':
        return 'from-orange-500/40 to-amber-500/40';
      case 'coffee':
        return 'from-amber-500/40 to-yellow-500/40';
      case 'dining':
        return 'from-red-500/40 to-orange-500/40';
      case 'shopping':
        return 'from-pink-500/40 to-rose-500/40';
      case 'nightlife':
        return 'from-purple-500/40 to-indigo-500/40';
      case 'entertainment':
        return 'from-cyan-500/40 to-teal-500/40';
      case 'fitness':
        return 'from-green-500/40 to-emerald-500/40';
      default:
        return 'from-gray-500/40 to-slate-500/40';
    }
  };

  return (
    <div className="min-h-screen pb-8">
      {/* Header */}
      <div className="px-4 pt-6 pb-4">
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={springConfig}
        >
          <div className="flex items-center justify-between mb-2">
            <h1 className="text-large-title text-white">
              Saved Spots
            </h1>
            <div className="flex items-center gap-2">
              <motion.button
                onClick={() => setViewMode(viewMode === 'all' ? 'collections' : 'all')}
                className="tap-target rounded-full flex items-center justify-center bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-white/30 shadow-lg px-3 py-2"
                whileTap={{ scale: 0.95 }}
                transition={springConfig}
              >
                <Folder className="w-[16px] h-[16px] text-white" strokeWidth={2.5} />
                <span className="text-[13px] text-white ml-1.5" style={{ fontWeight: 600 }}>
                  {viewMode === 'all' ? 'Collections' : 'All Spots'}
                </span>
              </motion.button>
            </div>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex items-center gap-1.5">
              <Heart className="w-4 h-4 text-pink-400 fill-pink-400" strokeWidth={2.5} />
              <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                {stats.total}
              </span>
            </div>
            {stats.totalVisits > 0 && (
              <>
                <span className="text-white/50">•</span>
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4 text-green-400" strokeWidth={2.5} />
                  <span className="text-[15px] text-white" style={{ fontWeight: 600 }}>
                    {stats.totalVisits} visits
                  </span>
                </div>
              </>
            )}
          </div>
        </motion.div>

        {/* Search & Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.1 }}
        >
          <div className="flex gap-2 mb-3">
            <div className="flex-1 flex items-center gap-2.5 rounded-full px-4 py-2.5 border-2 border-white/30 shadow-xl bg-[#1C1C1E]/80 backdrop-blur-xl">
              <Search className="w-[15px] h-[15px] flex-shrink-0 text-white" strokeWidth={2.5} />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-transparent text-[15px] outline-none text-white placeholder:text-white/60"
                style={{ fontWeight: 400 }}
                placeholder="Search saved spots..."
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="tap-target"
                >
                  <X className="w-[15px] h-[15px] text-white" strokeWidth={2.5} />
                </button>
              )}
            </div>
            
            <motion.button
              onClick={() => setShowFilters(!showFilters)}
              className={`tap-target rounded-full flex items-center justify-center border-2 shadow-lg px-3 ${
                showFilters
                  ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-purple-400/50'
                  : 'bg-[#1C1C1E]/80 backdrop-blur-xl border-white/30'
              }`}
              whileTap={{ scale: 0.95 }}
              transition={springConfig}
            >
              <SlidersHorizontal className="w-[16px] h-[16px] text-white" strokeWidth={2.5} />
            </motion.button>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={springConfig}
                className="overflow-hidden"
              >
                <div className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl mb-3">
                  {/* Sort */}
                  <div className="mb-4">
                    <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 600 }}>
                      SORT BY
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 'recent', label: 'Recent', icon: Clock },
                        { value: 'name', label: 'Name', icon: Edit3 },
                        { value: 'visits', label: 'Visits', icon: TrendingUp },
                        { value: 'distance', label: 'Distance', icon: MapPin },
                      ].map(({ value, label, icon: Icon }) => (
                        <button
                          key={value}
                          onClick={() => setSortBy(value as any)}
                          className={`px-3 py-1.5 rounded-full border-2 text-[13px] ${
                            sortBy === value
                              ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-purple-400/50 text-white'
                              : 'border-white/30 bg-[#2C2C2E]/60 text-white/80'
                          }`}
                          style={{ fontWeight: 600 }}
                        >
                          <div className="flex items-center gap-1">
                            <Icon className="w-3 h-3" strokeWidth={2.5} />
                            {label}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Filter by Type */}
                  <div>
                    <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 600 }}>
                      FILTER BY TYPE
                    </p>
                    <div className="flex gap-2 flex-wrap">
                      {[
                        { value: 'all', label: 'All', count: stats.total },
                        { value: 'parking', label: 'Parking', count: stats.byType.parking },
                        { value: 'valet', label: 'Valet', count: stats.byType.valet },
                        { value: 'venue', label: 'Venues', count: stats.byType.venue },
                        { value: 'coffee', label: 'Coffee', count: stats.byType.coffee },
                        { value: 'dining', label: 'Dining', count: stats.byType.dining },
                      ].filter(f => f.count > 0).map(({ value, label, count }) => (
                        <button
                          key={value}
                          onClick={() => setFilterType(value as any)}
                          className={`px-3 py-1.5 rounded-full border-2 text-[13px] ${
                            filterType === value
                              ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-purple-400/50 text-white'
                              : 'border-white/30 bg-[#2C2C2E]/60 text-white/80'
                          }`}
                          style={{ fontWeight: 600 }}
                        >
                          {label} ({count})
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      {/* Collections View */}
      {viewMode === 'collections' && !selectedCollection && (
        <div className="px-4">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-title-2 text-white">Collections</h2>
            <motion.button
              onClick={() => setShowNewCollection(true)}
              className="tap-target rounded-full flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-2 border-purple-400/50"
              whileTap={{ scale: 0.95 }}
            >
              <Plus className="w-4 h-4 text-white" strokeWidth={2.5} />
              <span className="text-[13px] text-white" style={{ fontWeight: 600 }}>New</span>
            </motion.button>
          </div>

          {/* New Collection Input */}
          <AnimatePresence>
            {showNewCollection && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="mb-3 overflow-hidden"
              >
                <div className="rounded-[16px] p-4 border-2 border-purple-400/50 bg-gradient-to-br from-purple-500/20 to-cyan-500/10 backdrop-blur-xl">
                  <input
                    type="text"
                    value={newCollectionName}
                    onChange={(e) => setNewCollectionName(e.target.value)}
                    placeholder="Collection name..."
                    className="w-full bg-[#1C1C1E]/60 rounded-full px-4 py-2 text-[15px] text-white border-2 border-white/30 outline-none mb-3"
                    autoFocus
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleCreateCollection}
                      className="flex-1 py-2 rounded-full bg-gradient-to-br from-purple-500/60 to-cyan-500/60 text-white text-[15px]"
                      style={{ fontWeight: 600 }}
                    >
                      Create
                    </button>
                    <button
                      onClick={() => {
                        setShowNewCollection(false);
                        setNewCollectionName('');
                      }}
                      className="flex-1 py-2 rounded-full bg-[#2C2C2E]/80 text-white text-[15px]"
                      style={{ fontWeight: 600 }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Collections Grid */}
          <div className="grid grid-cols-2 gap-3">
            {collections.map((collection, index) => (
              <motion.button
                key={collection.id}
                onClick={() => setSelectedCollection(collection)}
                className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl text-left"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...springConfig, delay: index * 0.05 }}
                whileTap={{ scale: 0.98 }}
              >
                <div className="text-3xl mb-2">{collection.icon}</div>
                <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                  {collection.name}
                </h3>
                <p className="text-[13px] text-white/70 mb-2">
                  {collection.description}
                </p>
                <div className="flex items-center gap-1.5">
                  <Archive className="w-3.5 h-3.5 text-white/60" strokeWidth={2.5} />
                  <span className="text-[13px] text-white/60" style={{ fontWeight: 600 }}>
                    {collection.spotIds.length} spots
                  </span>
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      )}

      {/* Collection Detail View */}
      {viewMode === 'collections' && selectedCollection && (
        <div className="px-4">
          <motion.button
            onClick={() => setSelectedCollection(null)}
            className="flex items-center gap-2 mb-4 text-white"
            whileTap={{ scale: 0.95 }}
          >
            <Navigation className="w-4 h-4 rotate-180" strokeWidth={2.5} />
            <span className="text-[15px]" style={{ fontWeight: 600 }}>Back to Collections</span>
          </motion.button>

          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-3xl">{selectedCollection.icon}</div>
              <h2 className="text-title-2 text-white">{selectedCollection.name}</h2>
            </div>
            <p className="text-[15px] text-white/70">
              {getCollectionSpots(selectedCollection.id).length} spots
            </p>
          </div>
        </div>
      )}

      {/* Spots List */}
      {(viewMode === 'all' || selectedCollection) && (
        <div className="px-4">
          {displayedSpots.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12"
            >
              <Heart className="w-16 h-16 mx-auto mb-4 text-white/30" strokeWidth={1.5} />
              <p className="text-[17px] text-white/70 mb-2" style={{ fontWeight: 600 }}>
                {searchQuery ? 'No spots found' : 'No saved spots yet'}
              </p>
              <p className="text-[15px] text-white/50">
                {searchQuery ? 'Try a different search' : 'Save your favorite spots to see them here'}
              </p>
            </motion.div>
          ) : (
            <div className="space-y-3">
              {displayedSpots.map((spot, index) => (
                <motion.div
                  key={spot.id}
                  className="rounded-[16px] p-4 border-2 border-white/30 bg-[#1C1C1E]/80 backdrop-blur-xl shadow-xl relative overflow-hidden"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ ...springConfig, delay: index * 0.05 }}
                  whileHover={{ scale: 1.005 }}
                >
                  {/* Type Badge */}
                  <div className="absolute top-3 right-3">
                    <div className={`w-8 h-8 rounded-full bg-gradient-to-br ${getTypeColor(spot.type)} border-2 border-white/30 flex items-center justify-center text-[16px]`}>
                      {getTypeIcon(spot.type)}
                    </div>
                  </div>

                  {/* Content */}
                  <div className="pr-10">
                    <h3 className="text-[17px] text-white mb-1" style={{ fontWeight: 600 }}>
                      {spot.name}
                    </h3>
                    <p className="text-[15px] text-white/70 mb-3">
                      {spot.address}
                    </p>

                    {/* Metadata */}
                    <div className="flex items-center gap-3 mb-3 text-[13px]">
                      {spot.distance && (
                        <div className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5 text-cyan-400" strokeWidth={2.5} />
                          <span className="text-white" style={{ fontWeight: 600 }}>
                            {spot.distance} mi
                          </span>
                        </div>
                      )}
                      {spot.rating && (
                        <>
                          <span className="text-white/50">•</span>
                          <div className="flex items-center gap-1">
                            <Star className="w-3.5 h-3.5 text-yellow-400 fill-yellow-400" strokeWidth={2.5} />
                            <span className="text-white" style={{ fontWeight: 600 }}>
                              {spot.rating}
                            </span>
                          </div>
                        </>
                      )}
                      {spot.visitCount && spot.visitCount > 0 && (
                        <>
                          <span className="text-white/50">•</span>
                          <span className="text-green-400" style={{ fontWeight: 600 }}>
                            {spot.visitCount} visits
                          </span>
                        </>
                      )}
                    </div>

                    {/* Notes Preview */}
                    {spot.notes && (
                      <p className="text-[13px] text-white/60 italic mb-3 line-clamp-2">
                        "{spot.notes}"
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <motion.button
                        onClick={() => handleNavigate(spot)}
                        className="flex-1 py-2 rounded-full bg-gradient-to-br from-purple-500/60 to-cyan-500/60 border-2 border-purple-400/50 flex items-center justify-center gap-2"
                        whileTap={{ scale: 0.95 }}
                      >
                        <Navigation className="w-4 h-4 text-white" strokeWidth={2.5} />
                        <span className="text-[14px] text-white" style={{ fontWeight: 600 }}>
                          Navigate
                        </span>
                      </motion.button>

                      <motion.button
                        onClick={() => {
                          setSelectedSpot(spot);
                          setNotesText(spot.notes || '');
                        }}
                        className="tap-target rounded-full flex items-center justify-center bg-[#2C2C2E]/80 border-2 border-white/30"
                        whileTap={{ scale: 0.95 }}
                      >
                        <Edit3 className="w-4 h-4 text-white" strokeWidth={2.5} />
                      </motion.button>

                      <motion.button
                        onClick={() => handleRemoveSpot(spot.id)}
                        className="tap-target rounded-full flex items-center justify-center bg-red-500/20 border-2 border-red-400/50"
                        whileTap={{ scale: 0.95 }}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" strokeWidth={2.5} />
                      </motion.button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Spot Detail Modal */}
      <AnimatePresence>
        {selectedSpot && (
          <>
            <motion.div
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedSpot(null)}
            />
            
            <motion.div
              className="fixed bottom-0 left-0 right-0 bg-[#1C1C1E]/95 backdrop-blur-xl border-t-2 border-white/30 z-50 rounded-t-[24px] max-w-[393px] mx-auto"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={springConfig}
            >
              <div className="p-6">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h2 className="text-title-2 text-white mb-1">{selectedSpot.name}</h2>
                    <p className="text-[15px] text-white/70">{selectedSpot.address}</p>
                  </div>
                  <button
                    onClick={() => setSelectedSpot(null)}
                    className="tap-target rounded-full bg-[#2C2C2E]/80 border-2 border-white/30 flex items-center justify-center"
                  >
                    <X className="w-4 h-4 text-white" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Notes Section */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[13px] text-white/70" style={{ fontWeight: 600 }}>
                      NOTES
                    </p>
                    <button
                      onClick={() => setEditingNotes(!editingNotes)}
                      className="text-[13px] text-purple-400"
                      style={{ fontWeight: 600 }}
                    >
                      {editingNotes ? 'Cancel' : 'Edit'}
                    </button>
                  </div>
                  
                  {editingNotes ? (
                    <div>
                      <textarea
                        value={notesText}
                        onChange={(e) => setNotesText(e.target.value)}
                        className="w-full bg-[#2C2C2E]/60 rounded-[12px] p-3 text-[15px] text-white border-2 border-white/30 outline-none resize-none"
                        rows={4}
                        placeholder="Add notes about this spot..."
                      />
                      <button
                        onClick={handleSaveNotes}
                        className="w-full mt-2 py-2 rounded-full bg-gradient-to-br from-purple-500/60 to-cyan-500/60 text-white text-[15px]"
                        style={{ fontWeight: 600 }}
                      >
                        Save Notes
                      </button>
                    </div>
                  ) : (
                    <p className="text-[15px] text-white/80 italic">
                      {selectedSpot.notes || 'No notes yet'}
                    </p>
                  )}
                </div>

                {/* Add to Collection */}
                <div>
                  <p className="text-[13px] text-white/70 mb-2" style={{ fontWeight: 600 }}>
                    ADD TO COLLECTION
                  </p>
                  <div className="flex gap-2 flex-wrap">
                    {collections.map(collection => (
                      <button
                        key={collection.id}
                        onClick={() => handleAddToCollection(collection.id, selectedSpot.id)}
                        className={`px-3 py-1.5 rounded-full border-2 text-[13px] ${
                          collection.spotIds.includes(selectedSpot.id)
                            ? 'bg-gradient-to-br from-purple-500/40 to-cyan-500/40 border-purple-400/50 text-white'
                            : 'border-white/30 bg-[#2C2C2E]/60 text-white/80'
                        }`}
                        style={{ fontWeight: 600 }}
                      >
                        {collection.icon} {collection.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
